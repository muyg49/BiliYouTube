import { browser } from 'wxt/browser'

import type {
  ApiRequest,
  ApiResponse,
  BiliChannelVideo,
  BiliChannelVideoPage,
  BiliDynamicFilter,
  BiliDynamicItem,
  BiliDynamicPage,
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
  wbi_img?: {
    img_url?: string
    sub_url?: string
  }
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

interface DynamicArchiveRaw {
  bvid?: string
  title?: string
  cover?: string
  jump_url?: string
  duration_text?: string
  stat?: { play?: string | number }
}

interface DynamicRawItem {
  id_str?: string
  type?: string
  basic?: { jump_url?: string }
  modules?: {
    module_author?: {
      mid?: number
      name?: string
      face?: string
      pub_ts?: number
    }
    module_dynamic?: {
      desc?: { text?: string } | null
      major?: {
        archive?: DynamicArchiveRaw
        draw?: { items?: Array<{ src?: string }> }
        opus?: {
          summary?: { text?: string }
          pics?: Array<{ url?: string }>
          jump_url?: string
        }
        article?: {
          title?: string
          covers?: string[]
          jump_url?: string
        }
      } | null
    }
  }
}

interface DynamicData {
  has_more?: boolean
  items?: DynamicRawItem[]
  offset?: string
}

interface FollowingRawItem {
  mid: number
  uname: string
  face: string
  sign?: string
}

interface FollowingData {
  list?: FollowingRawItem[]
  total?: number
}

interface ChannelArchiveRaw {
  aid?: number
  bvid?: string
  title?: string
  pic?: string
  description?: string
  length?: string
  play?: number | string
  created?: number
}

interface ChannelArchiveData {
  list?: {
    vlist?: ChannelArchiveRaw[]
  }
  page?: {
    count?: number
    pn?: number
    ps?: number
  }
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
const WBI_MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]
const MD5_SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]
const MD5_K = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000) >>> 0)
let cachedWbi: { key: string; expiresAt: number } | null = null

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

function normalizeBilibiliUrl(url = ''): string {
  if (!url)
    return ''
  if (url.startsWith('//'))
    return `https:${url}`
  if (url.startsWith('/'))
    return `https://www.bilibili.com${url}`
  return url.replace(/^http:\/\//, 'https://')
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

function normalizeDynamicItem(item: DynamicRawItem): BiliDynamicItem | null {
  const author = item.modules?.module_author
  const dynamic = item.modules?.module_dynamic
  const major = dynamic?.major
  const archive = major?.archive
  const id = item.id_str?.trim()
  const mid = author?.mid ?? 0
  const name = author?.name?.trim()
  if (!id || !mid || !name)
    return null

  const video = archive?.bvid && archive.title
    ? {
        bvid: archive.bvid,
        title: archive.title,
        cover: normalizeImage(archive.cover ?? ''),
        durationText: archive.duration_text ?? '',
        viewText: archive.stat?.play == null ? '' : String(archive.stat.play),
        url: normalizeBilibiliUrl(archive.jump_url || `https://www.bilibili.com/video/${archive.bvid}`),
      }
    : undefined

  const images = [
    ...(major?.draw?.items ?? []).map(entry => normalizeImage(entry.src ?? '')),
    ...(major?.opus?.pics ?? []).map(entry => normalizeImage(entry.url ?? '')),
    ...(major?.article?.covers ?? []).map(normalizeImage),
  ].filter(Boolean)

  const text = dynamic?.desc?.text?.trim()
    || major?.opus?.summary?.text?.trim()
    || major?.article?.title?.trim()
    || ''
  const fallbackUrl = normalizeBilibiliUrl(
    item.basic?.jump_url
      || major?.opus?.jump_url
      || major?.article?.jump_url
      || `https://t.bilibili.com/${id}`,
  )

  return {
    id,
    type: item.type ?? '',
    author: {
      mid,
      name,
      face: normalizeImage(author?.face ?? ''),
    },
    published: author?.pub_ts ?? 0,
    text,
    images: [...new Set(images)],
    url: video?.url || fallbackUrl,
    video,
  }
}

function normalizeFollowing(item: FollowingRawItem): BiliFollowing {
  return {
    mid: item.mid,
    uname: item.uname,
    face: normalizeImage(item.face),
    sign: item.sign,
  }
}

function normalizeChannelVideo(item: ChannelArchiveRaw): BiliChannelVideo | null {
  if (!item.aid || !item.bvid || !item.title || !item.pic)
    return null

  const numericView = typeof item.play === 'number' ? item.play : Number(item.play ?? 0)
  return {
    aid: item.aid,
    bvid: item.bvid,
    title: item.title,
    cover: normalizeImage(item.pic),
    description: item.description ?? '',
    durationText: item.length ?? '',
    view: Number.isFinite(numericView) ? numericView : 0,
    published: item.created ?? 0,
    url: `https://www.bilibili.com/video/${item.bvid}`,
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

function rotateLeft(value: number, amount: number): number {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0
}

function md5(input: string): string {
  const source = new TextEncoder().encode(input)
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64
  const bytes = new Uint8Array(paddedLength)
  bytes.set(source)
  bytes[source.length] = 0x80

  const bitLength = source.length * 8
  const tail = new DataView(bytes.buffer)
  tail.setUint32(paddedLength - 8, bitLength >>> 0, true)
  tail.setUint32(paddedLength - 4, Math.floor(bitLength / 0x1_0000_0000) >>> 0, true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Uint32Array(16)
    const view = new DataView(bytes.buffer, offset, 64)
    for (let index = 0; index < 16; index += 1)
      words[index] = view.getUint32(index * 4, true)

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let index = 0; index < 64; index += 1) {
      let f = 0
      let g = 0
      if (index < 16) {
        f = (b & c) | (~b & d)
        g = index
      }
      else if (index < 32) {
        f = (d & b) | (~d & c)
        g = (5 * index + 1) % 16
      }
      else if (index < 48) {
        f = b ^ c ^ d
        g = (3 * index + 5) % 16
      }
      else {
        f = c ^ (b | ~d)
        g = (7 * index) % 16
      }

      const previousD = d
      d = c
      c = b
      const sum = (a + (f >>> 0) + MD5_K[index]! + words[g]!) >>> 0
      b = (b + rotateLeft(sum, MD5_SHIFT[index]!)) >>> 0
      a = previousD
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const output = new Uint8Array(16)
  const outputView = new DataView(output.buffer)
  outputView.setUint32(0, a0, true)
  outputView.setUint32(4, b0, true)
  outputView.setUint32(8, c0, true)
  outputView.setUint32(12, d0, true)
  return Array.from(output, byte => byte.toString(16).padStart(2, '0')).join('')
}

function filenameKey(url = ''): string {
  const filename = url.split('/').pop() ?? ''
  return filename.split('.')[0] ?? ''
}

async function getWbiMixinKey(): Promise<string> {
  if (cachedWbi && cachedWbi.expiresAt > Date.now())
    return cachedWbi.key

  const nav = await getJson<NavData>(`${API}/x/web-interface/nav`)
  const rawKey = `${filenameKey(nav.wbi_img?.img_url)}${filenameKey(nav.wbi_img?.sub_url)}`
  const key = WBI_MIXIN_KEY_ENC_TAB.map(index => rawKey[index] ?? '').join('').slice(0, 32)
  if (!key)
    throw new Error('Bilibili WBI key unavailable')

  cachedWbi = { key, expiresAt: Date.now() + 6 * 60 * 60 * 1000 }
  return key
}

async function makeWbiQuery(values: Record<string, string>): Promise<string> {
  const mixinKey = await getWbiMixinKey()
  const params = { ...values, wts: String(Math.floor(Date.now() / 1000)) }
  const query = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      const filtered = value.replace(/[!'()*]/g, '')
      return `${encodeURIComponent(key)}=${encodeURIComponent(filtered)}`
    })
    .join('&')
  return `${query}&w_rid=${md5(query + mixinKey)}`
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

async function getFollowingPage(mid: number, page: number): Promise<FollowingData> {
  const params = new URLSearchParams({
    vmid: String(mid),
    pn: String(page),
    ps: '50',
    order: 'desc',
    order_type: 'attention',
  })
  return getJson<FollowingData>(`${API}/x/relation/followings?${params}`)
}

async function getFollowing(mid: number, page = 1): Promise<BiliFollowing[]> {
  const first = await getFollowingPage(mid, page)
  const collected = [...(first.list ?? [])]
  if (page !== 1)
    return collected.map(normalizeFollowing)

  const total = first.total ?? collected.length
  const totalPages = Math.min(100, Math.ceil(total / 50))
  for (let nextPage = 2; nextPage <= totalPages; nextPage += 1) {
    const next = await getFollowingPage(mid, nextPage)
    const entries = next.list ?? []
    if (!entries.length)
      break
    collected.push(...entries)
  }

  const unique = new Map<number, FollowingRawItem>()
  for (const item of collected)
    unique.set(item.mid, item)
  return [...unique.values()].map(normalizeFollowing)
}

async function getDynamicFeed(
  mid?: number,
  filter: BiliDynamicFilter = 'all',
  offset = '',
): Promise<BiliDynamicPage> {
  const params = new URLSearchParams({
    timezone_offset: '-480',
    platform: 'web',
    features: 'itemOpusStyle,listOnlyfans,opusBigCover',
    type: filter,
  })
  if (offset)
    params.set('offset', offset)
  if (mid)
    params.set('host_mid', String(mid))

  const endpoint = mid
    ? `${API}/x/polymer/web-dynamic/v1/feed/space`
    : `${API}/x/polymer/web-dynamic/v1/feed/all`
  const data = await getJson<DynamicData>(`${endpoint}?${params}`)
  const items = (data.items ?? [])
    .map(normalizeDynamicItem)
    .filter((item): item is BiliDynamicItem => Boolean(item))

  return {
    items,
    offset: data.offset ?? '',
    hasMore: Boolean(data.has_more && data.offset),
  }
}

async function requestChannelArchive(mid: number, page: number): Promise<ChannelArchiveData> {
  const values = {
    mid: String(mid),
    pn: String(page),
    ps: '30',
    order: 'pubdate',
    order_avoided: 'true',
    platform: 'web',
    web_location: '1550101',
  }

  try {
    const query = await makeWbiQuery(values)
    return await getJson<ChannelArchiveData>(`${API}/x/space/wbi/arc/search?${query}`)
  }
  catch (error) {
    console.debug('[BiliYouTube] WBI channel archive request failed, trying legacy endpoint', error)
    const params = new URLSearchParams({
      mid: String(mid),
      pn: String(page),
      ps: '30',
      order: 'pubdate',
    })
    return getJson<ChannelArchiveData>(`${API}/x/space/arc/search?${params}`)
  }
}

async function getChannelVideos(mid: number, page = 1): Promise<BiliChannelVideoPage> {
  const data = await requestChannelArchive(mid, page)
  const items = (data.list?.vlist ?? [])
    .map(normalizeChannelVideo)
    .filter((item): item is BiliChannelVideo => Boolean(item))
  const pageSize = data.page?.ps ?? 30
  const total = data.page?.count ?? items.length
  return {
    items,
    page,
    total,
    hasMore: page * pageSize < total && items.length > 0,
  }
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

async function enrichFavoriteFolder(folder: BiliFavoriteFolder): Promise<BiliFavoriteFolder> {
  let enriched = folder
  try {
    const params = new URLSearchParams({ media_id: String(folder.id) })
    const info = normalizeFavoriteFolder(await getJson<FavoriteFolderRaw>(`${API}/x/v3/fav/folder/info?${params}`))
    if (info)
      enriched = { ...folder, ...info }
  }
  catch (error) {
    console.debug('[BiliYouTube] favorite folder metadata unavailable', folder.id, error)
  }

  if (enriched.cover || !enriched.mediaCount)
    return enriched

  try {
    const params = new URLSearchParams({
      media_id: String(folder.id),
      pn: '1',
      ps: '1',
      order: 'mtime',
      platform: 'web',
    })
    const data = await getJson<FavoriteResourceData>(`${API}/x/v3/fav/resource/list?${params}`)
    const cover = normalizeImage(data.medias?.[0]?.cover ?? '')
    if (cover)
      enriched = { ...enriched, cover }
  }
  catch (error) {
    console.debug('[BiliYouTube] favorite folder preview unavailable', folder.id, error)
  }

  return enriched
}

async function getFavoriteFolders(mid: number): Promise<BiliFavoriteFolder[]> {
  const params = new URLSearchParams({
    up_mid: String(mid),
    type: '2',
  })
  const data = await getJson<{ list?: FavoriteFolderRaw[] }>(`${API}/x/v3/fav/folder/created/list-all?${params}`)
  const folders = (data.list ?? [])
    .map(normalizeFavoriteFolder)
    .filter((folder): folder is BiliFavoriteFolder => Boolean(folder))
  return Promise.all(folders.map(enrichFavoriteFolder))
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
        case 'dynamicFeed':
          return { ok: true, data: await getDynamicFeed(message.mid, message.filter, message.offset) }
        case 'channelVideos':
          return { ok: true, data: await getChannelVideos(message.mid, message.page ?? 1) }
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
