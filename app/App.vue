<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { callApi } from '../lib/api'
import type {
  BiliFavoriteFolder,
  BiliFavoriteItem,
  BiliFavoritePage,
  BiliFavoriteSort,
  BiliFollowing,
  BiliHistoryCursor,
  BiliHistoryFilter,
  BiliHistoryItem,
  BiliHistoryPage,
  BiliUser,
  BiliVideo,
  BiliWatchLaterItem,
  BiliWatchLaterPage,
} from '../types/bilibili'

type AppView = 'home' | 'history' | 'favorites' | 'watch-later'

const user = ref<BiliUser | null>(null)
const following = ref<BiliFollowing[]>([])
const subscriptionsExpanded = ref(false)
const shellLoading = ref(true)

const videos = ref<BiliVideo[]>([])
const homeLoading = ref(false)
const homeLoadingMore = ref(false)
const homePage = ref(1)
const homeError = ref('')

const historyItems = ref<BiliHistoryItem[]>([])
const historyCursor = ref<BiliHistoryCursor | null>(null)
const historyHasMore = ref(true)
const historyLoading = ref(false)
const historyLoadingMore = ref(false)
const historyError = ref('')
const historyFilter = ref<BiliHistoryFilter>('all')
const historySearch = ref('')
const historyPaused = ref(false)
const historyManageMode = ref(false)
const historyActionBusy = ref(false)

const favoriteFolders = ref<BiliFavoriteFolder[]>([])
const favoriteFoldersLoading = ref(false)
const favoriteSelectedId = ref(favoriteFolderIdFromLocation())
const favoriteSelectedFolder = ref<BiliFavoriteFolder | null>(null)
const favoriteItems = ref<BiliFavoriteItem[]>([])
const favoritePage = ref(1)
const favoriteHasMore = ref(false)
const favoriteLoading = ref(false)
const favoriteLoadingMore = ref(false)
const favoriteError = ref('')
const favoriteSort = ref<BiliFavoriteSort>('mtime')
const favoriteSearch = ref('')
const favoriteSearchDraft = ref('')
const favoriteActionBusy = ref(false)

const watchLaterItems = ref<BiliWatchLaterItem[]>([])
const watchLaterCount = ref(0)
const watchLaterLoading = ref(false)
const watchLaterError = ref('')
const watchLaterSearch = ref('')
const watchLaterActionBusy = ref(false)

const searchKeyword = ref('')
const contentRef = ref<HTMLElement | null>(null)
const activeView = ref<AppView>(viewFromLocation())

const chips = ['全部', '音乐', '游戏', '知识', '科技', '影视', '动画', '生活', '美食', '数码', '汽车']
const historyFilters: Array<{ key: BiliHistoryFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'archive', label: '视频' },
  { key: 'live', label: '直播' },
  { key: 'article', label: '专栏' },
]
const favoriteSortOptions: Array<{ key: BiliFavoriteSort; label: string }> = [
  { key: 'mtime', label: '最近收藏' },
  { key: 'pubtime', label: '最新发布' },
  { key: 'view', label: '最多播放' },
]
const libraryItems: Array<{ label: string; icon: string; view: AppView }> = [
  { label: '历史记录', icon: 'history', view: 'history' },
  { label: '播放列表', icon: 'favorite', view: 'favorites' },
  { label: '稍后再看', icon: 'later', view: 'watch-later' },
]

const visibleFollowing = computed(() => subscriptionsExpanded.value ? following.value : following.value.slice(0, 7))
const canToggleFollowing = computed(() => following.value.length > 7)

const filteredHistory = computed(() => {
  const keyword = historySearch.value.trim().toLocaleLowerCase()
  if (!keyword)
    return historyItems.value
  return historyItems.value.filter((item) => {
    return item.title.toLocaleLowerCase().includes(keyword)
      || item.authorName.toLocaleLowerCase().includes(keyword)
      || item.subtitle?.toLocaleLowerCase().includes(keyword)
  })
})

const historyGroups = computed(() => {
  const groups: Array<{ label: string; items: BiliHistoryItem[] }> = []
  const byLabel = new Map<string, BiliHistoryItem[]>()
  for (const item of filteredHistory.value) {
    const label = historyDayLabel(item.viewAt)
    const group = byLabel.get(label)
    if (group)
      group.push(item)
    else
      byLabel.set(label, [item])
  }
  for (const [label, items] of byLabel)
    groups.push({ label, items })
  return groups
})

const favoriteSummaryCover = computed(() => favoriteSelectedFolder.value?.cover || favoriteItems.value[0]?.cover || '')
const filteredWatchLater = computed(() => {
  const keyword = watchLaterSearch.value.trim().toLocaleLowerCase()
  if (!keyword)
    return watchLaterItems.value
  return watchLaterItems.value.filter(item => item.title.toLocaleLowerCase().includes(keyword)
    || item.owner.name.toLocaleLowerCase().includes(keyword))
})
const watchLaterSummaryCover = computed(() => watchLaterItems.value[0]?.pic || '')

function viewFromLocation(): AppView {
  const hash = location.hash
  if (hash === '#biliyoutube/history')
    return 'history'
  if (hash.startsWith('#biliyoutube/favorites'))
    return 'favorites'
  if (hash === '#biliyoutube/watch-later')
    return 'watch-later'
  return 'home'
}

function favoriteFolderIdFromLocation(): number {
  const match = location.hash.match(/^#biliyoutube\/favorites\/(\d+)$/)
  return match ? Number(match[1]) : 0
}

function hashForView(view: AppView): string {
  if (view === 'history')
    return 'biliyoutube/history'
  if (view === 'favorites')
    return 'biliyoutube/favorites'
  if (view === 'watch-later')
    return 'biliyoutube/watch-later'
  return ''
}

function navigate(view: AppView) {
  const next = new URL(location.href)
  next.hash = hashForView(view)
  window.history.pushState({ biliyoutubeView: view }, '', `${next.pathname}${next.search}${next.hash}`)
  activeView.value = view
  if (view === 'favorites') {
    favoriteSelectedId.value = 0
    favoriteSelectedFolder.value = null
    favoriteItems.value = []
  }
  contentRef.value?.scrollTo({ top: 0 })
  void ensureViewLoaded(view)
}

function openFavoriteFolder(folder: BiliFavoriteFolder) {
  const next = new URL(location.href)
  next.hash = `biliyoutube/favorites/${folder.id}`
  window.history.pushState({ biliyoutubeView: 'favorites', favoriteId: folder.id }, '', `${next.pathname}${next.search}${next.hash}`)
  activeView.value = 'favorites'
  favoriteSelectedId.value = folder.id
  favoriteSelectedFolder.value = folder
  favoriteSearch.value = ''
  favoriteSearchDraft.value = ''
  favoriteSort.value = 'mtime'
  contentRef.value?.scrollTo({ top: 0 })
  void loadFavoritePage(true)
}

function handlePopState() {
  activeView.value = viewFromLocation()
  favoriteSelectedId.value = favoriteFolderIdFromLocation()
  if (!favoriteSelectedId.value) {
    favoriteSelectedFolder.value = null
    favoriteItems.value = []
  }
  contentRef.value?.scrollTo({ top: 0 })
  void ensureViewLoaded(activeView.value)
}

async function ensureViewLoaded(view: AppView) {
  if (view === 'home') {
    if (!videos.value.length && !homeLoading.value)
      await loadHome(true)
    return
  }
  if (view === 'history') {
    if (!historyItems.value.length && !historyLoading.value)
      await loadHistory(true)
    return
  }
  if (view === 'favorites') {
    if (!user.value)
      return
    if (!favoriteFolders.value.length)
      await loadFavoriteFolders()
    if (favoriteSelectedId.value)
      await loadFavoritePage(true)
    return
  }
  if (!watchLaterItems.value.length && !watchLaterLoading.value)
    await loadWatchLater()
}

function iconPath(icon: string): string {
  const paths: Record<string, string> = {
    menu: 'M4 6h16M4 12h16M4 18h16',
    home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    dynamic: 'M4 6h16v12H4zM8 10h8M8 14h5',
    history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
    favorite: 'M4 5h16v14H4zM8 9h8M8 13h5',
    later: 'M12 7v5l3 2M4 3h16v18H4z',
    search: 'm21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
    upload: 'M12 16V4m0 0L7 9m5-5 5 5M5 20h14',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    chevronDown: 'm6 9 6 6 6-6',
    chevronUp: 'm6 15 6-6 6 6',
    chevronRight: 'm9 6 6 6-6 6',
    arrowLeft: 'm15 18-6-6 6-6',
    trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5',
    pause: 'M8 5v14M16 5v14',
    play: 'm8 5 11 7-11 7z',
    settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3 2-1-2-3-2 .3-1.2-2.1.8-1.9-3-1-1.3 1.8L12 2 10.7.3l-3 1 .8 1.9L7.3 5.3 5 5 3 8l2 1v3l-2 1 2 3 2.3-.3 1.2 2.1-.8 1.9 3 1L12 19l1.3 1.7 3-1-.8-1.9 1.2-2.1 2.3.3 2-3-2-1Z',
    close: 'M6 6l12 12M18 6 6 18',
    lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z',
    playlist: 'M4 6h12M4 11h12M4 16h8m7-4v7m-3-3h6',
    check: 'm5 12 4 4L19 6',
  }
  return paths[icon] ?? paths.home!
}

function search() {
  const keyword = searchKeyword.value.trim()
  if (!keyword)
    return
  window.location.href = `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`
}

function searchChip(chip: string) {
  if (chip === '全部') {
    contentRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  window.location.href = `https://search.bilibili.com/all?keyword=${encodeURIComponent(chip)}`
}

function formatViews(value: number): string {
  if (value >= 100_000_000)
    return `${(value / 100_000_000).toFixed(1)}亿次观看`
  if (value >= 10_000)
    return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}万次观看`
  return `${value}次观看`
}

function relativeTime(timestamp: number): string {
  if (!timestamp)
    return ''
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - timestamp))
  const units: Array<[number, string]> = [
    [31_536_000, '年前'],
    [2_592_000, '个月前'],
    [604_800, '周前'],
    [86_400, '天前'],
    [3_600, '小时前'],
    [60, '分钟前'],
  ]
  for (const [size, label] of units) {
    if (seconds >= size)
      return `${Math.floor(seconds / size)}${label}`
  }
  return '刚刚'
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function historyDayLabel(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()

  if (sameDay(date, today))
    return '今天'
  if (sameDay(date, yesterday))
    return '昨天'
  if (date.getFullYear() === today.getFullYear())
    return `${date.getMonth() + 1}月${date.getDate()}日`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function historyProgress(item: BiliHistoryItem): number {
  if (!item.duration)
    return 0
  if (item.progress < 0)
    return 100
  return Math.max(0, Math.min(100, item.progress / item.duration * 100))
}

function watchProgress(item: BiliWatchLaterItem): number {
  if (!item.duration || item.progress <= 0)
    return 0
  return Math.max(0, Math.min(100, item.progress / item.duration * 100))
}

function getCsrfToken(): string {
  const item = document.cookie.split('; ').find(value => value.startsWith('bili_jct='))
  if (!item)
    return ''
  const raw = item.slice('bili_jct='.length)
  try {
    return decodeURIComponent(raw)
  }
  catch {
    return raw
  }
}

async function loadShell() {
  shellLoading.value = true
  try {
    const account = await callApi<BiliUser | null>({ type: 'user' })
    user.value = account
    if (account) {
      following.value = await callApi<BiliFollowing[]>({
        type: 'following',
        mid: account.mid,
        page: 1,
      })
    }
  }
  catch (error) {
    console.warn('[BiliYouTube] Failed to load account shell', error)
  }
  finally {
    shellLoading.value = false
  }
}

async function loadHome(reset = false) {
  if (homeLoading.value)
    return
  homeLoading.value = true
  if (reset) {
    homePage.value = 1
    homeError.value = ''
  }
  try {
    const feed = await callApi<BiliVideo[]>({ type: 'feed', page: 1 })
    videos.value = feed
  }
  catch (error) {
    homeError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    homeLoading.value = false
  }
}

async function loadMoreHome() {
  if (homeLoadingMore.value)
    return
  homeLoadingMore.value = true
  try {
    const nextPage = homePage.value + 1
    const next = await callApi<BiliVideo[]>({ type: 'feed', page: nextPage })
    const known = new Set(videos.value.map(video => video.bvid))
    videos.value.push(...next.filter(video => !known.has(video.bvid)))
    homePage.value = nextPage
  }
  catch (error) {
    console.warn('[BiliYouTube] Failed to load more videos', error)
  }
  finally {
    homeLoadingMore.value = false
  }
}

async function loadHistory(reset = false) {
  if (historyLoading.value || historyLoadingMore.value)
    return

  if (reset) {
    historyLoading.value = true
    historyError.value = ''
    historyCursor.value = null
    historyHasMore.value = true
  }
  else {
    if (!historyHasMore.value)
      return
    historyLoadingMore.value = true
  }

  try {
    const page = await callApi<BiliHistoryPage>({
      type: 'history',
      filter: historyFilter.value,
      cursor: reset ? null : historyCursor.value,
    })

    if (reset)
      historyItems.value = page.items
    else {
      const known = new Set(historyItems.value.map(item => item.id))
      historyItems.value.push(...page.items.filter(item => !known.has(item.id)))
    }
    historyCursor.value = page.cursor
    historyHasMore.value = page.hasMore && page.items.length > 0

    if (reset) {
      try {
        historyPaused.value = await callApi<boolean>({ type: 'historyState' })
      }
      catch (error) {
        console.debug('[BiliYouTube] Could not read history pause state', error)
      }
    }
  }
  catch (error) {
    historyError.value = error instanceof Error ? error.message : String(error)
    if (reset)
      historyItems.value = []
  }
  finally {
    historyLoading.value = false
    historyLoadingMore.value = false
  }
}

function setHistoryFilter(filter: BiliHistoryFilter) {
  if (historyFilter.value === filter)
    return
  historyFilter.value = filter
  contentRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
  void loadHistory(true)
}

async function toggleHistoryPaused() {
  if (historyActionBusy.value)
    return
  const csrf = getCsrfToken()
  if (!csrf) {
    historyError.value = '无法读取 Bilibili CSRF Token，请确认已登录后刷新页面。'
    return
  }

  historyActionBusy.value = true
  historyError.value = ''
  try {
    const next = !historyPaused.value
    await callApi<null>({ type: 'historySetPaused', paused: next, csrf })
    historyPaused.value = next
  }
  catch (error) {
    historyError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    historyActionBusy.value = false
  }
}

async function clearAllHistory() {
  if (historyActionBusy.value || !historyItems.value.length)
    return
  if (!window.confirm('确定要清空全部 Bilibili 观看记录吗？此操作无法撤销。'))
    return

  const csrf = getCsrfToken()
  if (!csrf) {
    historyError.value = '无法读取 Bilibili CSRF Token，请确认已登录后刷新页面。'
    return
  }

  historyActionBusy.value = true
  historyError.value = ''
  try {
    await callApi<null>({ type: 'historyClear', csrf })
    historyItems.value = []
    historyCursor.value = null
    historyHasMore.value = false
  }
  catch (error) {
    historyError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    historyActionBusy.value = false
  }
}

async function removeHistoryItem(item: BiliHistoryItem) {
  if (historyActionBusy.value)
    return
  const csrf = getCsrfToken()
  if (!csrf) {
    historyError.value = '无法读取 Bilibili CSRF Token，请确认已登录后刷新页面。'
    return
  }

  historyActionBusy.value = true
  historyError.value = ''
  try {
    await callApi<null>({
      type: 'historyDelete',
      oid: item.oid,
      business: item.business,
      csrf,
    })
    historyItems.value = historyItems.value.filter(entry => entry.id !== item.id)
  }
  catch (error) {
    historyError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    historyActionBusy.value = false
  }
}

async function loadFavoriteFolders() {
  if (favoriteFoldersLoading.value || !user.value)
    return
  favoriteFoldersLoading.value = true
  favoriteError.value = ''
  try {
    favoriteFolders.value = await callApi<BiliFavoriteFolder[]>({ type: 'favoriteFolders', mid: user.value.mid })
    if (favoriteSelectedId.value && !favoriteSelectedFolder.value)
      favoriteSelectedFolder.value = favoriteFolders.value.find(folder => folder.id === favoriteSelectedId.value) ?? null
  }
  catch (error) {
    favoriteError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    favoriteFoldersLoading.value = false
  }
}

async function loadFavoritePage(reset = false) {
  if (!favoriteSelectedId.value || favoriteLoading.value || favoriteLoadingMore.value)
    return

  if (reset) {
    favoriteLoading.value = true
    favoriteError.value = ''
    favoritePage.value = 1
  }
  else {
    if (!favoriteHasMore.value)
      return
    favoriteLoadingMore.value = true
  }

  try {
    const pageNumber = reset ? 1 : favoritePage.value + 1
    const page = await callApi<BiliFavoritePage>({
      type: 'favoritePage',
      mediaId: favoriteSelectedId.value,
      page: pageNumber,
      sort: favoriteSort.value,
      keyword: favoriteSearch.value,
    })
    if (page.folder)
      favoriteSelectedFolder.value = page.folder
    if (reset)
      favoriteItems.value = page.items
    else {
      const known = new Set(favoriteItems.value.map(item => `${item.type}:${item.id}`))
      favoriteItems.value.push(...page.items.filter(item => !known.has(`${item.type}:${item.id}`)))
    }
    favoritePage.value = page.page
    favoriteHasMore.value = page.hasMore
  }
  catch (error) {
    favoriteError.value = error instanceof Error ? error.message : String(error)
    if (reset)
      favoriteItems.value = []
  }
  finally {
    favoriteLoading.value = false
    favoriteLoadingMore.value = false
  }
}

function setFavoriteSort(sort: BiliFavoriteSort) {
  if (favoriteSort.value === sort)
    return
  favoriteSort.value = sort
  void loadFavoritePage(true)
}

function submitFavoriteSearch() {
  const next = favoriteSearchDraft.value.trim()
  if (favoriteSearch.value === next)
    return
  favoriteSearch.value = next
  void loadFavoritePage(true)
}

async function removeFavoriteItem(item: BiliFavoriteItem) {
  if (favoriteActionBusy.value || !favoriteSelectedId.value)
    return
  const csrf = getCsrfToken()
  if (!csrf) {
    favoriteError.value = '无法读取 Bilibili CSRF Token，请确认已登录后刷新页面。'
    return
  }

  favoriteActionBusy.value = true
  favoriteError.value = ''
  try {
    await callApi<null>({
      type: 'favoriteDelete',
      mediaId: favoriteSelectedId.value,
      resourceId: item.id,
      resourceType: item.type,
      csrf,
    })
    favoriteItems.value = favoriteItems.value.filter(entry => !(entry.id === item.id && entry.type === item.type))
    if (favoriteSelectedFolder.value)
      favoriteSelectedFolder.value.mediaCount = Math.max(0, favoriteSelectedFolder.value.mediaCount - 1)
    const folder = favoriteFolders.value.find(entry => entry.id === favoriteSelectedId.value)
    if (folder)
      folder.mediaCount = Math.max(0, folder.mediaCount - 1)
  }
  catch (error) {
    favoriteError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    favoriteActionBusy.value = false
  }
}

async function loadWatchLater() {
  if (watchLaterLoading.value)
    return
  watchLaterLoading.value = true
  watchLaterError.value = ''
  try {
    const page = await callApi<BiliWatchLaterPage>({ type: 'watchLater' })
    watchLaterCount.value = page.count
    watchLaterItems.value = page.items
  }
  catch (error) {
    watchLaterError.value = error instanceof Error ? error.message : String(error)
    watchLaterItems.value = []
  }
  finally {
    watchLaterLoading.value = false
  }
}

async function removeWatchLaterItem(item: BiliWatchLaterItem) {
  if (watchLaterActionBusy.value)
    return
  const csrf = getCsrfToken()
  if (!csrf) {
    watchLaterError.value = '无法读取 Bilibili CSRF Token，请确认已登录后刷新页面。'
    return
  }

  watchLaterActionBusy.value = true
  watchLaterError.value = ''
  try {
    await callApi<null>({ type: 'watchLaterDelete', aid: item.aid, csrf })
    watchLaterItems.value = watchLaterItems.value.filter(entry => entry.aid !== item.aid)
    watchLaterCount.value = Math.max(0, watchLaterCount.value - 1)
  }
  catch (error) {
    watchLaterError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    watchLaterActionBusy.value = false
  }
}

async function removeViewedWatchLater() {
  if (watchLaterActionBusy.value || !watchLaterItems.value.some(item => item.progress > 0))
    return
  const csrf = getCsrfToken()
  if (!csrf) {
    watchLaterError.value = '无法读取 Bilibili CSRF Token，请确认已登录后刷新页面。'
    return
  }

  watchLaterActionBusy.value = true
  watchLaterError.value = ''
  try {
    await callApi<null>({ type: 'watchLaterDeleteViewed', csrf })
    await loadWatchLater()
  }
  catch (error) {
    watchLaterError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    watchLaterActionBusy.value = false
  }
}

async function clearWatchLater() {
  if (watchLaterActionBusy.value || !watchLaterItems.value.length)
    return
  if (!window.confirm('确定要清空全部稍后再看视频吗？此操作无法撤销。'))
    return
  const csrf = getCsrfToken()
  if (!csrf) {
    watchLaterError.value = '无法读取 Bilibili CSRF Token，请确认已登录后刷新页面。'
    return
  }

  watchLaterActionBusy.value = true
  watchLaterError.value = ''
  try {
    await callApi<null>({ type: 'watchLaterClear', csrf })
    watchLaterItems.value = []
    watchLaterCount.value = 0
  }
  catch (error) {
    watchLaterError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    watchLaterActionBusy.value = false
  }
}

function handleScroll(event: Event) {
  const el = event.currentTarget as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight >= 900)
    return

  if (activeView.value === 'history')
    void loadHistory(false)
  else if (activeView.value === 'favorites' && favoriteSelectedId.value)
    void loadFavoritePage(false)
  else if (activeView.value === 'home')
    void loadMoreHome()
}

onMounted(() => {
  window.addEventListener('popstate', handlePopState)
  void (async () => {
    await loadShell()
    await ensureViewLoaded(activeView.value)
  })()
  if (activeView.value === 'home')
    void loadHome(true)
})

onBeforeUnmount(() => {
  window.removeEventListener('popstate', handlePopState)
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-section">
        <button class="icon-button menu-button" aria-label="菜单">
          <svg viewBox="0 0 24 24"><path :d="iconPath('menu')" /></svg>
        </button>
        <button class="brand brand-button" aria-label="BiliYouTube 首页" @click="navigate('home')">
          <span class="brand-mark">▶</span>
          <span class="brand-text">BiliYouTube</span>
        </button>
      </div>

      <form class="search-wrap" @submit.prevent="search">
        <div class="search-box">
          <input v-model="searchKeyword" type="search" placeholder="搜索" autocomplete="off">
          <button type="submit" class="search-button" aria-label="搜索">
            <svg viewBox="0 0 24 24"><path :d="iconPath('search')" /></svg>
          </button>
        </div>
      </form>

      <div class="top-actions">
        <a class="create-button" href="https://member.bilibili.com/platform/upload/video/frame">
          <svg viewBox="0 0 24 24"><path :d="iconPath('upload')" /></svg>
          <span>投稿</span>
        </a>
        <a class="icon-button" href="https://message.bilibili.com/" aria-label="消息">
          <svg viewBox="0 0 24 24"><path :d="iconPath('bell')" /></svg>
        </a>
        <a v-if="user" class="avatar-link" :href="`https://space.bilibili.com/${user.mid}`">
          <img :src="user.face" :alt="user.name">
        </a>
        <a v-else-if="!shellLoading" class="login-button" href="https://passport.bilibili.com/login">登录</a>
      </div>
    </header>

    <aside class="sidebar">
      <nav class="sidebar-group">
        <button class="sidebar-item sidebar-button" :class="{ active: activeView === 'home' }" @click="navigate('home')">
          <svg viewBox="0 0 24 24"><path :d="iconPath('home')" /></svg>
          <span>首页</span>
        </button>
        <a class="sidebar-item" href="https://t.bilibili.com/">
          <svg viewBox="0 0 24 24"><path :d="iconPath('dynamic')" /></svg>
          <span>动态</span>
        </a>
      </nav>

      <div v-if="following.length" class="divider" />

      <section v-if="following.length" class="sidebar-section subscriptions">
        <a class="section-heading-link" href="https://t.bilibili.com/">
          <h2>订阅</h2>
          <svg viewBox="0 0 24 24"><path :d="iconPath('chevronRight')" /></svg>
        </a>
        <a v-for="channel in visibleFollowing" :key="channel.mid" class="channel-item" :href="`https://space.bilibili.com/${channel.mid}`">
          <img :src="channel.face" :alt="channel.uname">
          <span>{{ channel.uname }}</span>
        </a>
        <button v-if="canToggleFollowing" class="show-more" @click="subscriptionsExpanded = !subscriptionsExpanded">
          <svg viewBox="0 0 24 24"><path :d="iconPath(subscriptionsExpanded ? 'chevronUp' : 'chevronDown')" /></svg>
          <span>{{ subscriptionsExpanded ? '收起' : '显示更多' }}</span>
        </button>
      </section>

      <div class="divider" />

      <section class="sidebar-section">
        <div class="section-heading-link static-heading">
          <h2>你</h2>
          <svg viewBox="0 0 24 24"><path :d="iconPath('chevronRight')" /></svg>
        </div>
        <button
          v-for="item in libraryItems"
          :key="item.label"
          class="sidebar-item sidebar-button"
          :class="{ active: activeView === item.view }"
          @click="navigate(item.view)"
        >
          <svg viewBox="0 0 24 24"><path :d="iconPath(item.icon)" /></svg>
          <span>{{ item.label }}</span>
        </button>
      </section>
    </aside>

    <main
      ref="contentRef"
      class="main-area"
      :class="{
        'history-main': activeView === 'history',
        'library-main': activeView === 'favorites' || activeView === 'watch-later',
      }"
      @scroll.passive="handleScroll"
    >
      <template v-if="activeView === 'home'">
        <div class="chipbar">
          <button v-for="chip in chips" :key="chip" class="chip" :class="{ active: chip === '全部' }" @click="searchChip(chip)">
            {{ chip }}
          </button>
        </div>

        <div v-if="homeLoading" class="status-page">
          <div class="spinner" />
          <p>正在加载推荐内容…</p>
        </div>

        <div v-else-if="homeError" class="status-page error-state">
          <h2>无法加载 Bilibili 内容</h2>
          <p>{{ homeError }}</p>
          <button @click="loadHome(true)">重试</button>
        </div>

        <section v-else class="feed-grid" aria-label="推荐视频">
          <article v-for="video in videos" :key="video.bvid" class="video-card">
            <a class="thumbnail-link" :href="`https://www.bilibili.com/video/${video.bvid}`">
              <img class="thumbnail" :src="video.pic" :alt="video.title" loading="lazy">
              <span class="duration">{{ formatDuration(video.duration) }}</span>
            </a>

            <div class="video-meta">
              <a class="channel-avatar" :href="`https://space.bilibili.com/${video.owner.mid}`" :aria-label="video.owner.name">
                <img v-if="video.owner.face" :src="video.owner.face" :alt="video.owner.name" loading="lazy">
                <span v-else>{{ video.owner.name.slice(0, 1) }}</span>
              </a>
              <div class="video-copy">
                <a class="video-title" :href="`https://www.bilibili.com/video/${video.bvid}`">{{ video.title }}</a>
                <a class="channel-name" :href="`https://space.bilibili.com/${video.owner.mid}`">{{ video.owner.name }}</a>
                <div class="video-stats">
                  <span>{{ formatViews(video.view) }}</span>
                  <span v-if="video.published">• {{ relativeTime(video.published) }}</span>
                </div>
              </div>
              <button class="more-button" aria-label="更多操作">⋮</button>
            </div>
          </article>
        </section>

        <div v-if="homeLoadingMore" class="loading-more">
          <div class="spinner small" />
        </div>
      </template>

      <template v-else-if="activeView === 'history'">
        <div class="history-layout">
          <section class="history-content" aria-label="观看记录">
            <header class="history-header">
              <h1>观看记录</h1>
              <div class="history-filter-row">
                <button
                  v-for="filter in historyFilters"
                  :key="filter.key"
                  class="chip"
                  :class="{ active: historyFilter === filter.key }"
                  @click="setHistoryFilter(filter.key)"
                >
                  {{ filter.label }}
                </button>
              </div>
            </header>

            <div v-if="historyError" class="history-inline-error">
              <span>{{ historyError }}</span>
              <button aria-label="关闭" @click="historyError = ''">
                <svg viewBox="0 0 24 24"><path :d="iconPath('close')" /></svg>
              </button>
            </div>

            <div v-if="historyLoading" class="history-loading">
              <div class="spinner" />
            </div>

            <div v-else-if="!user && !shellLoading" class="history-empty">
              <h2>登录后即可查看观看记录</h2>
              <p>BiliYouTube 会直接读取当前浏览器中的 Bilibili 登录状态。</p>
              <a class="login-button" href="https://passport.bilibili.com/login">登录</a>
            </div>

            <div v-else-if="!historyGroups.length" class="history-empty">
              <h2>{{ historySearch ? '没有匹配的观看记录' : '暂无观看记录' }}</h2>
              <p v-if="historySearch">尝试其他搜索关键词。</p>
            </div>

            <div v-else class="history-groups">
              <section v-for="group in historyGroups" :key="group.label" class="history-day-group">
                <h2>{{ group.label }}</h2>
                <article v-for="item in group.items" :key="item.id" class="history-card">
                  <a class="history-thumb" :href="item.url">
                    <img v-if="item.cover" :src="item.cover" :alt="item.title" loading="lazy">
                    <span v-if="item.duration" class="duration">{{ formatDuration(item.duration) }}</span>
                    <span v-if="item.badge" class="history-badge">{{ item.badge }}</span>
                    <span v-if="item.duration" class="history-progress" :style="{ width: `${historyProgress(item)}%` }" />
                  </a>
                  <div class="history-copy">
                    <a class="history-title" :href="item.url">{{ item.title }}</a>
                    <a v-if="item.authorMid" class="history-author" :href="`https://space.bilibili.com/${item.authorMid}`">{{ item.authorName }}</a>
                    <span v-else class="history-author">{{ item.authorName }}</span>
                    <p v-if="item.subtitle" class="history-subtitle">{{ item.subtitle }}</p>
                    <div class="history-meta">
                      <span>{{ relativeTime(item.viewAt) }}观看</span>
                      <span v-if="item.progress > 0 && item.duration">• 看到 {{ formatDuration(item.progress) }}</span>
                    </div>
                  </div>
                  <button
                    v-if="historyManageMode"
                    class="history-delete-button"
                    :disabled="historyActionBusy"
                    aria-label="从观看记录中移除"
                    title="从观看记录中移除"
                    @click="removeHistoryItem(item)"
                  >
                    <svg viewBox="0 0 24 24"><path :d="iconPath('trash')" /></svg>
                  </button>
                  <button v-else class="more-button history-more" aria-label="更多操作">⋮</button>
                </article>
              </section>
            </div>

            <div v-if="historyLoadingMore" class="loading-more">
              <div class="spinner small" />
            </div>
          </section>

          <aside class="history-controls">
            <label class="history-search">
              <svg viewBox="0 0 24 24"><path :d="iconPath('search')" /></svg>
              <input v-model="historySearch" type="search" placeholder="搜索观看记录">
            </label>

            <button class="history-action" :disabled="historyActionBusy || !historyItems.length" @click="clearAllHistory">
              <svg viewBox="0 0 24 24"><path :d="iconPath('trash')" /></svg>
              <span>清除所有观看记录</span>
            </button>
            <button class="history-action" :disabled="historyActionBusy" @click="toggleHistoryPaused">
              <svg viewBox="0 0 24 24"><path :d="iconPath(historyPaused ? 'play' : 'pause')" /></svg>
              <span>{{ historyPaused ? '开启观看记录' : '暂停观看记录' }}</span>
            </button>
            <button class="history-action" :class="{ active: historyManageMode }" @click="historyManageMode = !historyManageMode">
              <svg viewBox="0 0 24 24"><path :d="iconPath('settings')" /></svg>
              <span>{{ historyManageMode ? '完成管理' : '管理所有观看记录' }}</span>
            </button>
          </aside>
        </div>
      </template>

      <template v-else-if="activeView === 'favorites'">
        <section v-if="!favoriteSelectedId" class="library-page">
          <header class="library-page-header">
            <h1>播放列表</h1>
          </header>

          <div v-if="favoriteError" class="history-inline-error library-error">
            <span>{{ favoriteError }}</span>
            <button aria-label="关闭" @click="favoriteError = ''">
              <svg viewBox="0 0 24 24"><path :d="iconPath('close')" /></svg>
            </button>
          </div>

          <div v-if="favoriteFoldersLoading || shellLoading" class="library-loading">
            <div class="spinner" />
          </div>
          <div v-else-if="!user" class="library-empty">
            <h2>登录后即可查看播放列表</h2>
            <p>你的 Bilibili 收藏夹会在这里以 YouTube 风格展示。</p>
            <a class="login-button" href="https://passport.bilibili.com/login">登录</a>
          </div>
          <div v-else-if="!favoriteFolders.length" class="library-empty">
            <h2>暂无播放列表</h2>
            <p>在 Bilibili 收藏视频后，收藏夹会显示在这里。</p>
          </div>
          <div v-else class="playlist-grid">
            <button v-for="folder in favoriteFolders" :key="folder.id" class="playlist-card" @click="openFavoriteFolder(folder)">
              <div class="playlist-card-cover">
                <img v-if="folder.cover" :src="folder.cover" :alt="folder.title" loading="lazy">
                <div v-else class="playlist-placeholder">
                  <svg viewBox="0 0 24 24"><path :d="iconPath('playlist')" /></svg>
                </div>
                <span class="playlist-count">{{ folder.mediaCount }} 个视频</span>
              </div>
              <h2>{{ folder.title }}</h2>
              <p>{{ folder.isPrivate ? '私密' : '公开' }} · 查看完整播放列表</p>
            </button>
          </div>
        </section>

        <section v-else class="playlist-detail-layout">
          <aside class="playlist-summary">
            <button class="playlist-back" @click="navigate('favorites')">
              <svg viewBox="0 0 24 24"><path :d="iconPath('arrowLeft')" /></svg>
              <span>播放列表</span>
            </button>
            <div class="playlist-summary-cover">
              <img v-if="favoriteSummaryCover" :src="favoriteSummaryCover" :alt="favoriteSelectedFolder?.title || '播放列表'">
              <div v-else class="playlist-placeholder large">
                <svg viewBox="0 0 24 24"><path :d="iconPath('playlist')" /></svg>
              </div>
            </div>
            <h1>{{ favoriteSelectedFolder?.title || '播放列表' }}</h1>
            <a v-if="user" class="playlist-owner" :href="`https://space.bilibili.com/${user.mid}`">{{ user.name }}</a>
            <p class="playlist-summary-meta">
              {{ favoriteSelectedFolder?.mediaCount ?? favoriteItems.length }} 个视频
              <span v-if="favoriteSelectedFolder?.isPrivate"> · 私密</span>
            </p>
            <p v-if="favoriteSelectedFolder?.intro" class="playlist-description">{{ favoriteSelectedFolder.intro }}</p>
            <a v-if="favoriteItems.length" class="playlist-play-all" :href="favoriteItems[0]?.url">
              <svg viewBox="0 0 24 24"><path :d="iconPath('play')" /></svg>
              <span>播放全部</span>
            </a>
          </aside>

          <div class="playlist-list-panel">
            <div v-if="favoriteError" class="history-inline-error library-error">
              <span>{{ favoriteError }}</span>
              <button aria-label="关闭" @click="favoriteError = ''">
                <svg viewBox="0 0 24 24"><path :d="iconPath('close')" /></svg>
              </button>
            </div>

            <div class="playlist-toolbar">
              <form class="library-search" @submit.prevent="submitFavoriteSearch">
                <svg viewBox="0 0 24 24"><path :d="iconPath('search')" /></svg>
                <input v-model="favoriteSearchDraft" type="search" placeholder="搜索播放列表">
              </form>
              <div class="playlist-sort-row">
                <button
                  v-for="option in favoriteSortOptions"
                  :key="option.key"
                  class="chip"
                  :class="{ active: favoriteSort === option.key }"
                  @click="setFavoriteSort(option.key)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div v-if="favoriteLoading" class="library-loading compact">
              <div class="spinner" />
            </div>
            <div v-else-if="!favoriteItems.length" class="library-empty compact">
              <h2>{{ favoriteSearch ? '没有匹配的视频' : '这个播放列表是空的' }}</h2>
            </div>
            <div v-else class="playlist-video-list">
              <article v-for="(item, index) in favoriteItems" :key="`${item.type}:${item.id}`" class="playlist-video-row" :class="{ invalid: item.invalid }">
                <span class="playlist-index">{{ index + 1 }}</span>
                <a class="playlist-video-thumb" :href="item.url">
                  <img v-if="item.cover" :src="item.cover" :alt="item.title" loading="lazy">
                  <span v-if="item.duration" class="duration">{{ formatDuration(item.duration) }}</span>
                </a>
                <div class="playlist-video-copy">
                  <a class="playlist-video-title" :href="item.url">{{ item.title }}</a>
                  <div class="playlist-video-meta">
                    <a v-if="item.authorMid" :href="`https://space.bilibili.com/${item.authorMid}`">{{ item.authorName }}</a>
                    <span v-else>{{ item.authorName }}</span>
                    <span v-if="item.view"> · {{ formatViews(item.view) }}</span>
                  </div>
                  <div v-if="item.favoriteAt" class="playlist-video-added">{{ relativeTime(item.favoriteAt) }}收藏</div>
                </div>
                <button
                  class="row-action-button"
                  :disabled="favoriteActionBusy"
                  aria-label="从播放列表中移除"
                  title="从播放列表中移除"
                  @click="removeFavoriteItem(item)"
                >
                  <svg viewBox="0 0 24 24"><path :d="iconPath('trash')" /></svg>
                </button>
              </article>
            </div>
            <div v-if="favoriteLoadingMore" class="loading-more">
              <div class="spinner small" />
            </div>
          </div>
        </section>
      </template>

      <template v-else>
        <section class="playlist-detail-layout watch-later-layout">
          <aside class="playlist-summary watch-later-summary">
            <div class="playlist-summary-cover">
              <img v-if="watchLaterSummaryCover" :src="watchLaterSummaryCover" alt="稍后再看">
              <div v-else class="playlist-placeholder large">
                <svg viewBox="0 0 24 24"><path :d="iconPath('later')" /></svg>
              </div>
            </div>
            <h1>稍后再看</h1>
            <a v-if="user" class="playlist-owner" :href="`https://space.bilibili.com/${user.mid}`">{{ user.name }}</a>
            <p class="playlist-summary-meta">{{ watchLaterCount }} 个视频 · 私密</p>
            <a v-if="watchLaterItems.length" class="playlist-play-all" :href="watchLaterItems[0]?.url">
              <svg viewBox="0 0 24 24"><path :d="iconPath('play')" /></svg>
              <span>播放全部</span>
            </a>
          </aside>

          <div class="playlist-list-panel">
            <div v-if="watchLaterError" class="history-inline-error library-error">
              <span>{{ watchLaterError }}</span>
              <button aria-label="关闭" @click="watchLaterError = ''">
                <svg viewBox="0 0 24 24"><path :d="iconPath('close')" /></svg>
              </button>
            </div>

            <div class="watch-later-toolbar">
              <label class="library-search">
                <svg viewBox="0 0 24 24"><path :d="iconPath('search')" /></svg>
                <input v-model="watchLaterSearch" type="search" placeholder="搜索稍后再看">
              </label>
              <div class="watch-later-actions">
                <button :disabled="watchLaterActionBusy || !watchLaterItems.some(item => item.progress > 0)" @click="removeViewedWatchLater">
                  <svg viewBox="0 0 24 24"><path :d="iconPath('check')" /></svg>
                  <span>移除已看视频</span>
                </button>
                <button :disabled="watchLaterActionBusy || !watchLaterItems.length" @click="clearWatchLater">
                  <svg viewBox="0 0 24 24"><path :d="iconPath('trash')" /></svg>
                  <span>清空</span>
                </button>
              </div>
            </div>

            <div v-if="watchLaterLoading || shellLoading" class="library-loading compact">
              <div class="spinner" />
            </div>
            <div v-else-if="!user" class="library-empty compact">
              <h2>登录后即可查看稍后再看</h2>
              <a class="login-button" href="https://passport.bilibili.com/login">登录</a>
            </div>
            <div v-else-if="!filteredWatchLater.length" class="library-empty compact">
              <h2>{{ watchLaterSearch ? '没有匹配的视频' : '稍后再看是空的' }}</h2>
            </div>
            <div v-else class="playlist-video-list">
              <article v-for="(item, index) in filteredWatchLater" :key="item.aid" class="playlist-video-row">
                <span class="playlist-index">{{ index + 1 }}</span>
                <a class="playlist-video-thumb" :href="item.url">
                  <img v-if="item.pic" :src="item.pic" :alt="item.title" loading="lazy">
                  <span v-if="item.duration" class="duration">{{ formatDuration(item.duration) }}</span>
                  <span v-if="item.progress > 0" class="history-progress" :style="{ width: `${watchProgress(item)}%` }" />
                </a>
                <div class="playlist-video-copy">
                  <a class="playlist-video-title" :href="item.url">{{ item.title }}</a>
                  <div class="playlist-video-meta">
                    <a v-if="item.owner.mid" :href="`https://space.bilibili.com/${item.owner.mid}`">{{ item.owner.name }}</a>
                    <span v-else>{{ item.owner.name }}</span>
                    <span v-if="item.view"> · {{ formatViews(item.view) }}</span>
                  </div>
                  <div class="playlist-video-added">
                    <span v-if="item.addedAt">{{ relativeTime(item.addedAt) }}添加</span>
                    <span v-if="item.progress > 0"> · 已看 {{ formatDuration(item.progress) }}</span>
                  </div>
                </div>
                <button
                  class="row-action-button"
                  :disabled="watchLaterActionBusy"
                  aria-label="从稍后再看中移除"
                  title="从稍后再看中移除"
                  @click="removeWatchLaterItem(item)"
                >
                  <svg viewBox="0 0 24 24"><path :d="iconPath('trash')" /></svg>
                </button>
              </article>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
