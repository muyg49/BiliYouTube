import { browser } from 'wxt/browser'

import type {
  ApiRequest,
  ApiResponse,
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

interface FavoriteFolderRaw {
  id?: number
  title?: string
  media_count?: number
  cover?: string
  intro?: string
  attr?: number
}

interface FavoriteResourceRaw {
  id?: number
  type?: number
  title?: string
  cover?: string
  intro?: string
  duration?: number
  upper?: { mid?: number; name?: string; face?: string }
  cnt_info?: { play?: number }
  pubtime?: number
  fav_time?: number
  bvid?: string
  bv_id?: string
  attr?: number
  link?: string
}

interface FavoriteResourceData {
  info?: FavoriteFolderRaw
  medias?: FavoriteResourceRaw[]
  has_more?: boolean
}

interface WatchLaterRawItem {
  aid?: number
  bvid?: string
  title?: string
  pic?: string
  desc?: string
  duration?: number
  owner?: { mid?: number; name?: string; face?: string }
  stat?: { view?: number }
  pubdate?: number
  progress?: number
  add_at?: number
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
  return url.startsWith('//') ? `https:${url}` : url.replace(/^http:\/\//, 'https://')
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

function normalizeFavoriteFolder(item: FavoriteFolderRaw): BiliFavoriteFolder | null {
  if (!item.id || !item.title)
    return null

  return {
    id: item.id,
    title: item.title,
    mediaCount: item.media_count ?? 0,
    cover: normalizeImage(item.cover ?? ''),
    intro: item.intro ?? '',
    isPrivate: Boolean((item.attr ?? 0) & 1),
  }
}

function favoriteItemUrl(item: FavoriteResourceRaw): string {
  const bvid = item.bvid || item.bv_id
  if (bvid)
    return `https://www.bilibili.com/video/${bvid}`
  if (item.type === 2 && item.id)
    return `https://www.bilibili.com/video/av${item.id}`
  if (item.link?.startsWith('https://') || item.link?.startsWith('http://'))
    return normalizeImage(item.link)
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.title ?? '')}`
}

function normalizeFavoriteItem(item: FavoriteResourceRaw): BiliFavoriteItem | null {
  if (!item.id || !item.title)
    return null

  const upper = item.upper
  return {
    id: item.id,
    type: item.type ?? 2,
    bvid: item.bvid || item.bv_id || undefined,
    title: item.title,
    cover: normalizeImage(item.cover ?? ''),
    intro: item.intro ?? '',
    duration: item.duration ?? 0,
    authorName: upper?.name || '未知 UP 主',
    authorMid: upper?.mid ?? 0,
    authorFace: normalizeImage(upper?.face ?? ''),
    view: item.cnt_info?.play ?? 0,
    published: item.pubtime ?? 0,
    favoriteAt: item.fav_time ?? 0,
    invalid: (item.attr ?? 0) !== 0,
    url: favoriteItemUrl(item),
  }
}

function normalizeWatchLaterItem(item: WatchLaterRawItem): BiliWatchLaterItem | null {
  if (!item.aid || !item.bvid || !item.title)
    return null

  const owner = item.owner
  return {
    aid: item.aid,
    bvid: item.bvid,
    title: item.title,
    pic: normalizeImage(item.pic ?? ''),
    description: item.desc ?? '',
    duration: item.duration ?? 0,
    owner: {
      mid: owner?.mid ?? 0,
      name: owner?.name || '未知 UP 主',
      face: normalizeImage(owner?.face ?? ''),
    },
    view: item.stat?.view ?? 0,
    published: item.pubdate ?? 0,
    progress: item.progress ?? 0,
    addedAt: item.add_at ?? 0,
    url: `https://www.bilibili.com/video/${item.bvid}`,
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

async function getFavoriteFolders(mid: number): Promise<BiliFavoriteFolder[]> {
  const params = new URLSearchParams({
    up_mid: String(mid),
    type: '2',
  })
  const data = await getJson<{ list?: FavoriteFolderRaw[] }>(`${API}/x/v3/fav/folder/created/list-all?${params}`)
  return (data.list ?? [])
    .map(normalizeFavoriteFolder)
    .filter((folder): folder is BiliFavoriteFolder => Boolean(folder))
}

async function getFavoritePage(
  mediaId: number,
  page = 1,
  sort: BiliFavoriteSort = 'mtime',
  keyword = '',
): Promise<BiliFavoritePage> {
  const params = new URLSearchParams({
    media_id: String(mediaId),
    pn: String(page),
    ps: '20',
    order: sort,
    platform: 'web',
  })
  if (keyword.trim())
    params.set('keyword', keyword.trim())

  const data = await getJson<FavoriteResourceData>(`${API}/x/v3/fav/resource/list?${params}`)
  return {
    folder: data.info ? normalizeFavoriteFolder(data.info) : null,
    items: (data.medias ?? [])
      .map(normalizeFavoriteItem)
      .filter((item): item is BiliFavoriteItem => Boolean(item)),
    page,
    hasMore: Boolean(data.has_more),
  }
}

async function deleteFavorite(mediaId: number, resourceId: number, resourceType: number, csrf: string): Promise<void> {
  await postForm(`${API}/x/v3/fav/resource/batch-del`, {
    media_id: String(mediaId),
    resources: `${resourceId}:${resourceType}`,
    platform: 'web',
    csrf,
  })
}

async function getWatchLater(): Promise<BiliWatchLaterPage> {
  const data = await getJson<{ count?: number; list?: WatchLaterRawItem[] }>(`${API}/x/v2/history/toview`)
  const items = (data.list ?? [])
    .map(normalizeWatchLaterItem)
    .filter((item): item is BiliWatchLaterItem => Boolean(item))
  return {
    count: data.count ?? items.length,
    items,
  }
}

async function deleteWatchLater(aid: number, csrf: string): Promise<void> {
  await postForm(`${API}/x/v2/history/toview/del`, {
    aid: String(aid),
    csrf,
  })
}

async function deleteViewedWatchLater(csrf: string): Promise<void> {
  await postForm(`${API}/x/v2/history/toview/del`, {
    viewed: 'true',
    csrf,
  })
}

async function clearWatchLater(csrf: string): Promise<void> {
  await postForm(`${API}/x/v2/history/toview/clear`, { csrf })
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
        case 'favoriteFolders':
          return { ok: true, data: await getFavoriteFolders(message.mid) }
        case 'favoritePage':
          return {
            ok: true,
            data: await getFavoritePage(message.mediaId, message.page ?? 1, message.sort ?? 'mtime', message.keyword ?? ''),
          }
        case 'favoriteDelete':
          await deleteFavorite(message.mediaId, message.resourceId, message.resourceType, message.csrf)
          return { ok: true, data: null }
        case 'watchLater':
          return { ok: true, data: await getWatchLater() }
        case 'watchLaterDelete':
          await deleteWatchLater(message.aid, message.csrf)
          return { ok: true, data: null }
        case 'watchLaterDeleteViewed':
          await deleteViewedWatchLater(message.csrf)
          return { ok: true, data: null }
        case 'watchLaterClear':
          await clearWatchLater(message.csrf)
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
