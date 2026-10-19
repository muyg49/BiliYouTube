export interface BiliUser {
  mid: number
  name: string
  face: string
}

export interface BiliAuthor {
  mid: number
  name: string
  face: string
}

export interface BiliVideo {
  bvid: string
  title: string
  pic: string
  duration: number
  owner: BiliAuthor
  view: number
  published: number
  reason?: string
}

export interface BiliFollowing {
  mid: number
  uname: string
  face: string
  sign?: string
}

export interface BiliDynamicVideo {
  bvid: string
  title: string
  cover: string
  durationText: string
  viewText: string
  url: string
}

export interface BiliDynamicItem {
  id: string
  type: string
  author: BiliAuthor
  published: number
  text: string
  images: string[]
  url: string
  video?: BiliDynamicVideo
}

export interface BiliDynamicPage {
  items: BiliDynamicItem[]
  offset: string
  hasMore: boolean
}

export type BiliDynamicFilter = 'all' | 'video'

export type BiliHistoryFilter = 'all' | 'archive' | 'live' | 'article'

export interface BiliHistoryCursor {
  max: number
  viewAt: number
  business: string
}

export interface BiliHistoryItem {
  id: string
  oid: number
  business: string
  bvid?: string
  title: string
  subtitle?: string
  cover: string
  authorName: string
  authorMid: number
  viewAt: number
  progress: number
  duration: number
  badge?: string
  url: string
}

export interface BiliHistoryPage {
  items: BiliHistoryItem[]
  cursor: BiliHistoryCursor | null
  hasMore: boolean
}

export type BiliFavoriteSort = 'mtime' | 'view' | 'pubtime'

export interface BiliFavoriteFolder {
  id: number
  title: string
  mediaCount: number
  cover: string
  intro: string
  isPrivate: boolean
}

export interface BiliFavoriteItem {
  id: number
  type: number
  bvid?: string
  title: string
  cover: string
  intro: string
  duration: number
  authorName: string
  authorMid: number
  authorFace: string
  view: number
  published: number
  favoriteAt: number
  invalid: boolean
  url: string
}

export interface BiliFavoritePage {
  folder: BiliFavoriteFolder | null
  items: BiliFavoriteItem[]
  page: number
  hasMore: boolean
}

export interface BiliWatchLaterItem {
  aid: number
  bvid: string
  title: string
  pic: string
  description: string
  duration: number
  owner: BiliAuthor
  view: number
  published: number
  progress: number
  addedAt: number
  url: string
}

export interface BiliWatchLaterPage {
  count: number
  items: BiliWatchLaterItem[]
}

export type ApiRequest =
  | { type: 'user' }
  | { type: 'feed'; page?: number }
  | { type: 'following'; mid: number; page?: number }
  | { type: 'dynamicFeed'; mid?: number; filter?: BiliDynamicFilter; offset?: string }
  | { type: 'history'; filter?: BiliHistoryFilter; cursor?: BiliHistoryCursor | null }
  | { type: 'historyState' }
  | { type: 'historySetPaused'; paused: boolean; csrf: string }
  | { type: 'historyClear'; csrf: string }
  | { type: 'historyDelete'; oid: number; business: string; csrf: string }
  | { type: 'favoriteFolders'; mid: number }
  | { type: 'favoritePage'; mediaId: number; page?: number; sort?: BiliFavoriteSort; keyword?: string }
  | { type: 'favoriteDelete'; mediaId: number; resourceId: number; resourceType: number; csrf: string }
  | { type: 'watchLater' }
  | { type: 'watchLaterDelete'; aid: number; csrf: string }
  | { type: 'watchLaterDeleteViewed'; csrf: string }
  | { type: 'watchLaterClear'; csrf: string }

export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}
