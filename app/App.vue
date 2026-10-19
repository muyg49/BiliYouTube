<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { callApi } from '../lib/api'
import type {
  BiliFollowing,
  BiliHistoryCursor,
  BiliHistoryFilter,
  BiliHistoryItem,
  BiliHistoryPage,
  BiliUser,
  BiliVideo,
} from '../types/bilibili'

type AppView = 'home' | 'history'

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

const libraryItems = computed(() => [
  { label: '历史记录', icon: 'history', view: 'history' as const },
  { label: '收藏', icon: 'favorite', href: user.value ? `https://space.bilibili.com/${user.value.mid}/favlist` : 'https://www.bilibili.com/account/favlist' },
  { label: '稍后再看', icon: 'later', href: 'https://www.bilibili.com/watchlater/list' },
])

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

function viewFromLocation(): AppView {
  return location.hash === '#biliyoutube/history' ? 'history' : 'home'
}

function navigate(view: AppView) {
  const next = new URL(location.href)
  next.hash = view === 'history' ? 'biliyoutube/history' : ''
  history.pushState({ biliyoutubeView: view }, '', `${next.pathname}${next.search}${next.hash}`)
  activeView.value = view
  contentRef.value?.scrollTo({ top: 0 })
  if (view === 'history' && !historyItems.value.length && !historyLoading.value)
    void loadHistory(true)
  if (view === 'home' && !videos.value.length && !homeLoading.value)
    void loadHome(true)
}

function handlePopState() {
  activeView.value = viewFromLocation()
  contentRef.value?.scrollTo({ top: 0 })
  if (activeView.value === 'history' && !historyItems.value.length)
    void loadHistory(true)
}

function iconPath(icon: string): string {
  const paths: Record<string, string> = {
    menu: 'M4 6h16M4 12h16M4 18h16',
    home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    dynamic: 'M4 6h16v12H4zM8 10h8M8 14h5',
    history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
    favorite: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.8 6.4 21l1.1-6.2L3 9.6l6.2-.9z',
    later: 'M12 7v5l3 2M4 3h16v18H4z',
    search: 'm21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
    upload: 'M12 16V4m0 0L7 9m5-5 5 5M5 20h14',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    chevronDown: 'm6 9 6 6 6-6',
    chevronUp: 'm6 15 6-6 6 6',
    chevronRight: 'm9 6 6 6-6 6',
    trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5',
    pause: 'M8 5v14M16 5v14',
    play: 'm8 5 11 7-11 7z',
    settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3 2-1-2-3-2 .3-1.2-2.1.8-1.9-3-1-1.3 1.8L12 2 10.7.3l-3 1 .8 1.9L7.3 5.3 5 5 3 8l2 1v3l-2 1 2 3 2.3-.3 1.2 2.1-.8 1.9 3 1L12 19l1.3 1.7 3-1-.8-1.9 1.2-2.1 2.3.3 2-3-2-1Z',
    close: 'M6 6l12 12M18 6 6 18',
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

function handleScroll(event: Event) {
  const el = event.currentTarget as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight >= 900)
    return

  if (activeView.value === 'history')
    void loadHistory(false)
  else
    void loadMoreHome()
}

onMounted(() => {
  window.addEventListener('popstate', handlePopState)
  void loadShell()
  if (activeView.value === 'history')
    void loadHistory(true)
  else
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
        <template v-for="item in libraryItems" :key="item.label">
          <button
            v-if="item.view"
            class="sidebar-item sidebar-button"
            :class="{ active: activeView === item.view }"
            @click="navigate(item.view)"
          >
            <svg viewBox="0 0 24 24"><path :d="iconPath(item.icon)" /></svg>
            <span>{{ item.label }}</span>
          </button>
          <a v-else class="sidebar-item" :href="item.href">
            <svg viewBox="0 0 24 24"><path :d="iconPath(item.icon)" /></svg>
            <span>{{ item.label }}</span>
          </a>
        </template>
      </section>
    </aside>

    <main ref="contentRef" class="main-area" :class="{ 'history-main': activeView === 'history' }" @scroll.passive="handleScroll">
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

      <template v-else>
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
    </main>
  </div>
</template>
