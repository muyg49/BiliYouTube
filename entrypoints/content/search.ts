import { signWbiQuery } from '../../lib/wbi'

interface SearchVideoRaw {
  bvid?: string
  title?: string
  description?: string
  pic?: string
  play?: number | string
  pubdate?: number
  duration?: string
  author?: string
  mid?: number
  upic?: string
}

interface SearchData {
  page?: number
  numPages?: number
  numResults?: number
  result?: SearchVideoRaw[]
}

interface SearchEnvelope {
  code: number
  message?: string
  data?: SearchData
}

type SearchMode = 'search' | 'topic'

interface SearchRoute {
  keyword: string
  mode: SearchMode
}

interface CachedSearch {
  data: SearchData
  expiresAt: number
}

export interface HomepageSearchBridge {
  destroy: () => void
}

const SEARCH_PREFIX = '#biliyoutube/search?'
const TOPICS = ['全部', '音乐', '游戏', '知识', '科技', '影视', '动画', '生活', '美食', '数码', '汽车']
const SEARCH_CACHE_TTL = 10 * 60 * 1000
const searchCache = new Map<string, CachedSearch>()
const searchInflight = new Map<string, Promise<SearchData>>()

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className)
    node.className = className
  return node
}

function text<T extends HTMLElement>(node: T, value: string): T {
  node.textContent = value
  return node
}

function normalizeImage(url = ''): string {
  if (url.startsWith('//'))
    return `https:${url}`
  return url.replace(/^http:\/\//, 'https://')
}

function plainText(value = ''): string {
  if (!value)
    return ''
  const parsed = new DOMParser().parseFromString(value, 'text/html')
  return parsed.body.textContent?.trim() ?? ''
}

function relativeTime(timestamp = 0): string {
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

function formatViews(value: number | string | undefined): string {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isFinite(numeric))
    return ''
  if (numeric >= 100_000_000)
    return `${(numeric / 100_000_000).toFixed(1)}亿次观看`
  if (numeric >= 10_000)
    return `${(numeric / 10_000).toFixed(numeric >= 100_000 ? 0 : 1)}万次观看`
  return `${numeric}次观看`
}

function searchRouteFromLocation(): SearchRoute | null {
  if (!location.hash.startsWith(SEARCH_PREFIX))
    return null
  const params = new URLSearchParams(location.hash.slice(SEARCH_PREFIX.length))
  const keyword = params.get('q')?.trim() ?? ''
  if (!keyword)
    return null
  return {
    keyword,
    mode: params.get('mode') === 'topic' ? 'topic' : 'search',
  }
}

function routeHash(keyword: string, mode: SearchMode): string {
  const params = new URLSearchParams({ q: keyword, mode })
  return `#biliyoutube/search?${params}`
}

function cacheKey(keyword: string, page: number): string {
  return `${keyword.trim().toLocaleLowerCase()}::${page}`
}

async function fetchSearchEndpoint(keyword: string, page: number): Promise<SearchData> {
  const values: Record<string, string> = {
    search_type: 'video',
    keyword,
    page: String(page),
    page_size: '20',
    order: 'totalrank',
    from_source: 'webtop_search',
    web_location: '1430654',
  }
  const query = await signWbiQuery(values)
  const response = await fetch(`https://api.bilibili.com/x/web-interface/wbi/search/type?${query}`, {
    credentials: 'include',
    headers: { Accept: 'application/json, text/plain, */*' },
    referrer: 'https://www.bilibili.com/',
    referrerPolicy: 'strict-origin-when-cross-origin',
  })
  if (!response.ok)
    throw new Error(`HTTP ${response.status}`)
  const payload = await response.json() as SearchEnvelope
  if (payload.code !== 0 || !payload.data)
    throw new Error(payload.message || `Bilibili API error ${payload.code}`)
  return payload.data
}

async function requestSearchNetwork(keyword: string, page: number): Promise<SearchData> {
  try {
    return await fetchSearchEndpoint(keyword, page)
  }
  catch (error) {
    if (!(error instanceof Error) || !/HTTP 412/.test(error.message))
      throw error

    try {
      await fetch('https://www.bilibili.com/', {
        credentials: 'include',
        cache: 'no-store',
        referrer: 'https://www.bilibili.com/',
      })
    }
    catch {
      // The signed retry below is the authoritative result.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
    return fetchSearchEndpoint(keyword, page)
  }
}

async function requestSearch(keyword: string, page: number): Promise<SearchData> {
  const key = cacheKey(keyword, page)
  const cached = searchCache.get(key)
  if (cached && cached.expiresAt > Date.now())
    return cached.data

  const inflight = searchInflight.get(key)
  if (inflight)
    return inflight

  const pending = requestSearchNetwork(keyword, page)
    .then((data) => {
      searchCache.set(key, { data, expiresAt: Date.now() + SEARCH_CACHE_TTL })
      return data
    })
    .catch((error) => {
      if (cached)
        return cached.data
      throw error
    })
    .finally(() => searchInflight.delete(key))

  searchInflight.set(key, pending)
  return pending
}

export function installHomepageSearch(container: HTMLElement): HomepageSearchBridge {
  const overlay = element('section', 'byt-search-overlay')
  overlay.hidden = true
  container.append(overlay)

  let routeToken = 0
  let currentRoute: SearchRoute | null = null

  function searchInput(): HTMLInputElement | null {
    return container.querySelector<HTMLInputElement>('.search-wrap input[type="search"]')
  }

  function setTopicState(keyword: string | null) {
    for (const chip of container.querySelectorAll<HTMLButtonElement>('.chipbar .chip')) {
      const label = chip.textContent?.trim() ?? ''
      chip.dataset.bytTopicActive = String(keyword ? label === keyword : label === '全部')
    }
  }

  function hideSearch() {
    routeToken += 1
    currentRoute = null
    overlay.hidden = true
    overlay.onscroll = null
    overlay.replaceChildren()
    overlay.classList.remove('byt-topic-overlay')
    container.classList.remove('byt-search-route')
    setTopicState(null)
    const input = searchInput()
    if (input)
      input.value = ''
  }

  function returnHome(pushHistory = true) {
    const next = new URL(location.href)
    next.hash = ''
    if (pushHistory)
      window.history.pushState({ biliyoutubeView: 'home' }, '', `${next.pathname}${next.search}`)
    else
      window.history.replaceState({ biliyoutubeView: 'home' }, '', `${next.pathname}${next.search}`)
    hideSearch()
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  }

  function pushRoute(route: SearchRoute) {
    const next = new URL(location.href)
    next.hash = routeHash(route.keyword, route.mode)
    window.history.pushState({ biliyoutubeSearch: route.keyword, mode: route.mode }, '', `${next.pathname}${next.search}${next.hash}`)
  }

  function videoUrl(video: SearchVideoRaw): string {
    return video.bvid ? `https://www.bilibili.com/video/${video.bvid}` : '#'
  }

  function authorUrl(video: SearchVideoRaw): string {
    return video.mid ? `https://space.bilibili.com/${video.mid}` : '#'
  }

  function renderTopicCard(video: SearchVideoRaw): HTMLElement | null {
    if (!video.bvid || !video.title)
      return null
    const card = element('article', 'byt-topic-card')
    const thumb = element('a', 'byt-topic-thumb')
    thumb.href = videoUrl(video)
    const image = element('img')
    image.src = normalizeImage(video.pic)
    image.alt = plainText(video.title)
    image.loading = 'lazy'
    thumb.append(image)
    if (video.duration)
      thumb.append(text(element('span', 'byt-search-duration'), video.duration))

    const meta = element('div', 'byt-topic-meta')
    const title = text(element('a', 'byt-topic-title'), plainText(video.title))
    title.href = videoUrl(video)
    const author = text(element('a', 'byt-topic-author'), video.author?.trim() || '未知 UP 主')
    author.href = authorUrl(video)
    const stats = text(
      element('div', 'byt-topic-stats'),
      [formatViews(video.play), relativeTime(video.pubdate)].filter(Boolean).join(' · '),
    )
    meta.append(title, author, stats)
    card.append(thumb, meta)
    return card
  }

  function renderSearchCard(video: SearchVideoRaw): HTMLElement | null {
    if (!video.bvid || !video.title)
      return null
    const card = element('article', 'byt-search-card')
    const thumb = element('a', 'byt-search-thumb')
    thumb.href = videoUrl(video)
    const image = element('img')
    image.src = normalizeImage(video.pic)
    image.alt = plainText(video.title)
    image.loading = 'lazy'
    thumb.append(image)
    if (video.duration)
      thumb.append(text(element('span', 'byt-search-duration'), video.duration))

    const copy = element('div', 'byt-search-copy')
    const title = text(element('a', 'byt-search-title'), plainText(video.title))
    title.href = videoUrl(video)
    const stats = text(
      element('div', 'byt-search-stats'),
      [formatViews(video.play), relativeTime(video.pubdate)].filter(Boolean).join(' · '),
    )
    const author = element('a', 'byt-search-author')
    author.href = authorUrl(video)
    const avatar = element('span', 'byt-search-avatar')
    if (video.upic) {
      const face = element('img')
      face.src = normalizeImage(video.upic)
      face.alt = video.author?.trim() || 'UP 主'
      face.loading = 'lazy'
      avatar.append(face)
    }
    else {
      avatar.textContent = (video.author?.trim() || 'U').slice(0, 1)
    }
    author.append(avatar, text(element('span'), video.author?.trim() || '未知 UP 主'))
    const description = text(element('p', 'byt-search-description'), plainText(video.description))
    copy.append(title, stats, author)
    if (description.textContent)
      copy.append(description)
    card.append(thumb, copy)
    return card
  }

  async function openSearch(keyword: string, mode: SearchMode, addHistory = true) {
    const trimmed = keyword.trim()
    if (!trimmed)
      return
    const route: SearchRoute = { keyword: trimmed, mode }
    if (addHistory)
      pushRoute(route)
    currentRoute = route
    const token = ++routeToken
    overlay.hidden = false
    overlay.scrollTop = 0
    overlay.replaceChildren()
    overlay.classList.toggle('byt-topic-overlay', mode === 'topic')
    container.classList.add('byt-search-route')
    setTopicState(mode === 'topic' ? trimmed : null)

    const input = searchInput()
    if (input)
      input.value = mode === 'search' ? trimmed : ''

    const page = element('div', `byt-search-page ${mode === 'topic' ? 'byt-topic-page' : 'byt-search-results-page'}`)
    if (mode === 'search') {
      const heading = element('header', 'byt-search-heading')
      heading.append(text(element('h1'), `“${trimmed}”的搜索结果`))
      page.append(heading)
    }

    const results = element('div', mode === 'topic' ? 'byt-topic-grid' : 'byt-search-list')
    const status = text(element('div', 'byt-search-status'), '正在加载…')
    page.append(results, status)
    overlay.append(page)

    let nextPage = 1
    let totalPages = Number.POSITIVE_INFINITY
    let loading = false

    const loadMore = async () => {
      if (loading || nextPage > totalPages || token !== routeToken)
        return
      loading = true
      status.hidden = false
      status.textContent = nextPage === 1 ? '正在加载…' : '正在加载更多…'
      try {
        const data = await requestSearch(trimmed, nextPage)
        if (token !== routeToken || currentRoute?.keyword !== trimmed || currentRoute?.mode !== mode)
          return
        const items = data.result ?? []
        for (const video of items) {
          const card = mode === 'topic' ? renderTopicCard(video) : renderSearchCard(video)
          if (card)
            results.append(card)
        }
        totalPages = Math.max(0, data.numPages ?? data.page ?? nextPage)
        nextPage += 1
        if (!results.childElementCount)
          status.textContent = '没有找到相关视频。'
        else
          status.hidden = true
      }
      catch (error) {
        if (token !== routeToken)
          return
        const message = error instanceof Error ? error.message : String(error)
        status.textContent = /412/.test(message)
          ? 'Bilibili 暂时限制了搜索请求，请稍后重试。已加载过的标签仍可从缓存打开。'
          : `搜索加载失败：${message}`
        totalPages = 0
      }
      finally {
        loading = false
      }
    }

    overlay.onscroll = () => {
      if (overlay.scrollHeight - overlay.scrollTop - overlay.clientHeight < 900)
        void loadMore()
    }
    await loadMore()
  }

  function syncFromLocation() {
    const route = searchRouteFromLocation()
    if (!route) {
      hideSearch()
      return
    }
    void openSearch(route.keyword, route.mode, false)
  }

  function onSubmit(rawEvent: Event) {
    if (!(rawEvent.target instanceof HTMLFormElement) || !rawEvent.target.classList.contains('search-wrap'))
      return
    rawEvent.preventDefault()
    rawEvent.stopPropagation()
    const keyword = searchInput()?.value.trim() ?? ''
    if (keyword)
      void openSearch(keyword, 'search', true)
  }

  function onPointerOver(rawEvent: Event) {
    const target = rawEvent.target
    if (!(target instanceof Element))
      return
    const chip = target.closest('.chipbar .chip') as HTMLButtonElement | null
    const topic = chip?.textContent?.trim() ?? ''
    if (!topic || topic === '全部' || !TOPICS.includes(topic))
      return
    void requestSearch(topic, 1).catch(() => {})
  }

  function onClick(rawEvent: Event) {
    if (!(rawEvent instanceof MouseEvent) || rawEvent.button !== 0)
      return
    const path = rawEvent.composedPath()
    const button = path.find(node => node instanceof HTMLButtonElement) as HTMLButtonElement | undefined
    if (button?.classList.contains('chip')) {
      const topic = button.textContent?.trim() ?? ''
      if (topic === '全部' && currentRoute?.mode === 'topic') {
        rawEvent.preventDefault()
        rawEvent.stopPropagation()
        returnHome(true)
        return
      }
      if (topic && topic !== '全部' && TOPICS.includes(topic)) {
        rawEvent.preventDefault()
        rawEvent.stopPropagation()
        void openSearch(topic, 'topic', true)
        return
      }
    }

    if (currentRoute && button?.matches('.brand-button, .sidebar-button'))
      hideSearch()

    if (currentRoute) {
      const anchor = path.find(node => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined
      if (anchor?.closest('.sidebar'))
        hideSearch()
    }
  }

  container.addEventListener('submit', onSubmit, true)
  container.addEventListener('pointerover', onPointerOver, true)
  container.addEventListener('click', onClick, true)
  window.addEventListener('popstate', syncFromLocation)
  syncFromLocation()

  return {
    destroy() {
      routeToken += 1
      container.removeEventListener('submit', onSubmit, true)
      container.removeEventListener('pointerover', onPointerOver, true)
      container.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', syncFromLocation)
      overlay.remove()
      container.classList.remove('byt-search-route')
    },
  }
}
