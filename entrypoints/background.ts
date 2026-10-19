import { browser } from 'wxt/browser'

import type {
  ApiRequest,
  ApiResponse,
  BiliFollowing,
  BiliHistoryCursor,
  BiliHistoryFilter,
  BiliHistoryItem,
  BiliHistoryPage,
  BiliUser,
  BiliVideo,
} from '../types/bilibili'

interface BiliEnvelope<T> {
  code: number
  message: string
  data: T
}

interface NavData {
  isLogin: boolean
  mid: number
  uname: string
  face: string
}

interface PopularItem {
  bvid: string
  title: string
  pic: string
  duration: number
  pubdate: number
  stat?: { view?: number }
  owner?: { mid?: number; name?: string; face?: string }
}

interface RecommendItem {
  bvid?: string
  title?: string
  pic?: string
  duration?: number
  pubdate?: number
  owner?: { mid?: number; name?: string; face?: string }
  stat?: { view?: number }
  rcmd_reason?: { content?: string }
  goto?: string
}

interface HistoryRawItem {
  title?: string
  long_title?: string
  cover?: string
  uri?: string
  author_name?: string
  author_mid?: number
  view_at?: number
  progress?: number
  duration?: number
  badge?: string
  show_title?: string
  kid?: number
  history?: {
    oid?: number
    bvid?: string
    business?: string
  }
}

interface HistoryData {
  cursor?: {
    max?: number
    view_at?: number
    business?: string
  }
  list?: HistoryRawItem[]
}

const API = 'https://api.bilibili.com'

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      Accept: 'application/json, text/plain, */*',
    },
  })

  if (!response.ok)
    throw new Error(`HTTP ${response.status}`)

  const envelope = await response.json() as BiliEnvelope<T>
  if (envelope.code !== 0)
    throw new Error(envelope.message || `Bilibili API error ${envelope.code}`)

  return envelope.data
}

async function postForm<T = null>(url: string, form: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams(form),
  })

  if (!response.ok)
    throw new Error(`HTTP ${response.status}`)

  const envelope = await response.json() as BiliEnvelope<T>
  if (envelope.code !== 0)
    throw new Error(envelope.message || `Bilibili API error ${envelope.code}`)

  return envelope.data
}

function normalizeImage(url = ''): string {
  return url.startsWith('//') ? `https:${url}` : url
}

function normalizeVideo(item: PopularItem | RecommendItem): BiliVideo | null {
  if (!item.bvid || !item.title || !item.pic)
    return null

  const owner = item.owner
  return {
    bvid: item.bvid,
    title: item.title,
    pic: normalizeImage(item.pic),
    duration: item.duration ?? 0,
    owner: {
      mid: owner?.mid ?? 0,
      name: owner?.name ?? '未知 UP 主',
      face: normalizeImage(owner?.face ?? ''),
    },
    view: item.stat?.view ?? 0,
    published: item.pubdate ?? 0,
    reason: 'rcmd_reason' in item ? item.rcmd_reason?.content : undefined,
  }
}

function historyUrl(item: HistoryRawItem, oid: number, business: string): string {
  const bvid = item.history?.bvid
  if (bvid)
    return `https://www.bilibili.com/video/${bvid}`

  if (item.uri?.startsWith('https://') || item.uri?.startsWith('http://'))
    return item.uri.replace(/^http:\/\//, 'https://')

  if (business === 'live')
    return `https://live.bilibili.com/${oid}`
  if (business === 'article')
    return `https://www.bilibili.com/read/cv${oid}`

  return 'https://www.bilibili.com/'
}

function normalizeHistoryItem(item: HistoryRawItem): BiliHistoryItem | null {
  const oid = item.history?.oid ?? item.kid ?? 0
  const business = item.history?.business ?? 'archive'
  const title = item.title?.trim()
  if (!oid || !title)
    return null

  return {
    id: `${business}:${oid}:${item.view_at ?? 0}`,
    oid,
    business,
    bvid: item.history?.bvid || undefined,
    title,
    subtitle: item.show_title || item.long_title || undefined,
    cover: normalizeImage(item.cover ?? ''),
    authorName: item.author_name?.trim() || '未知 UP 主',
    authorMid: item.author_mid ?? 0,
    viewAt: item.view_at ?? 0,
    progress: item.progress ?? 0,
    duration: item.duration ?? 0,
    badge: item.badge || undefined,
    url: historyUrl(item, oid, business),
  }
}

async function getUser(): Promise<BiliUser | null> {
  const data = await getJson<NavData>(`${API}/x/web-interface/nav`)
  if (!data.isLogin)
    return null

  return {
    mid: data.mid,
    name: data.uname,
    face: normalizeImage(data.face),
  }
}

async function getPopular(page = 1): Promise<BiliVideo[]> {
  const params = new URLSearchParams({
    pn: String(page),
    ps: '30',
  })
  const data = await getJson<{ list?: PopularItem[] }>(`${API}/x/web-interface/popular?${params}`)
  return (data.list ?? []).map(normalizeVideo).filter((video): video is BiliVideo => Boolean(video))
}

async function getRecommend(page = 1): Promise<BiliVideo[]> {
  const params = new URLSearchParams({
    web_location: '1430650',
    y_num: '4',
    fresh_type: '3',
    feed_version: 'V8',
    homepage_ver: '1',
    ps: '30',
    fresh_idx: String(page),
    fresh_idx_1h: String(page),
    fetch_row: String(page),
    brush: String(Math.max(0, page - 1)),
    device: 'unknown',
    last_y_num: '4',
  })

  const data = await getJson<{ item?: RecommendItem[] }>(`${API}/x/web-interface/wbi/index/top/feed/rcmd?${params}`)
  return (data.item ?? [])
    .filter(item => item.goto === 'av' || Boolean(item.bvid))
    .map(normalizeVideo)
    .filter((video): video is BiliVideo => Boolean(video))
}

async function getFeed(page = 1): Promise<BiliVideo[]> {
  try {
    const recommended = await getRecommend(page)
    if (recommended.length)
      return recommended
  }
  catch (error) {
    console.debug('[BiliYouTube] recommendation API unavailable, falling back to popular feed', error)
  }

  return getPopular(page)
}

async function getFollowing(mid: number, page = 1): Promise<BiliFollowing[]> {
  const params = new URLSearchParams({
    vmid: String(mid),
    pn: String(page),
    ps: '20',
    order: 'desc',
    order_type: 'attention',
  })
  const data = await getJson<{ list?: Array<{ mid: number; uname: string; face: string; sign?: string }> }>(
    `${API}/x/relation/followings?${params}`,
  )

  return (data.list ?? []).map(item => ({
    mid: item.mid,
    uname: item.uname,
    face: normalizeImage(item.face),
    sign: item.sign,
  }))
}

async function getHistory(filter: BiliHistoryFilter = 'all', cursor?: BiliHistoryCursor | null): Promise<BiliHistoryPage> {
  const params = new URLSearchParams({
    ps: '30',
    type: filter,
  })

  if (cursor) {
    params.set('max', String(cursor.max))
    params.set('view_at', String(cursor.viewAt))
    params.set('business', cursor.business)
  }

  const data = await getJson<HistoryData>(`${API}/x/web-interface/history/cursor?${params}`)
  const items = (data.list ?? [])
    .map(normalizeHistoryItem)
    .filter((item): item is BiliHistoryItem => Boolean(item))
  const nextCursor = data.cursor && typeof data.cursor.max === 'number' && typeof data.cursor.view_at === 'number'
    ? {
        max: data.cursor.max,
        viewAt: data.cursor.view_at,
        business: data.cursor.business ?? '',
      }
    : null

  return {
    items,
    cursor: nextCursor,
    hasMore: Boolean(nextCursor) && (data.list?.length ?? 0) > 0,
  }
}

async function getHistoryState(): Promise<boolean> {
  return getJson<boolean>(`${API}/x/v2/history/shadow`)
}

async function setHistoryPaused(paused: boolean, csrf: string): Promise<void> {
  await postForm(`${API}/x/v2/history/shadow/set`, {
    switch: String(paused),
    csrf,
  })
}

async function clearHistory(csrf: string): Promise<void> {
  await postForm(`${API}/x/v2/history/clear`, { csrf })
}

async function deleteHistory(oid: number, business: string, csrf: string): Promise<void> {
  await postForm(`${API}/x/v2/history/delete`, {
    kid: `${business}_${oid}`,
    csrf,
  })
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(async (message: ApiRequest): Promise<ApiResponse<unknown>> => {
    try {
      switch (message.type) {
        case 'user':
          return { ok: true, data: await getUser() }
        case 'feed':
          return { ok: true, data: await getFeed(message.page ?? 1) }
        case 'following':
          return { ok: true, data: await getFollowing(message.mid, message.page ?? 1) }
        case 'history':
          return { ok: true, data: await getHistory(message.filter, message.cursor) }
        case 'historyState':
          return { ok: true, data: await getHistoryState() }
        case 'historySetPaused':
          await setHistoryPaused(message.paused, message.csrf)
          return { ok: true, data: null }
        case 'historyClear':
          await clearHistory(message.csrf)
          return { ok: true, data: null }
        case 'historyDelete':
          await deleteHistory(message.oid, message.business, message.csrf)
          return { ok: true, data: null }
        default:
          return { ok: false, error: 'Unknown request' }
      }
    }
    catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      console.error('[BiliYouTube] API request failed:', error)
      return { ok: false, error: text }
    }
  })
})
