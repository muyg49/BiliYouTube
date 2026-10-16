import { browser } from 'wxt/browser'

import type { ApiRequest, ApiResponse, BiliFollowing, BiliUser, BiliVideo } from '../types/bilibili'

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
