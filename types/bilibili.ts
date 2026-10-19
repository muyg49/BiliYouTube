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

export type ApiRequest =
  | { type: 'user' }
  | { type: 'feed'; page?: number }
  | { type: 'following'; mid: number; page?: number }
  | { type: 'history'; filter?: BiliHistoryFilter; cursor?: BiliHistoryCursor | null }
  | { type: 'historyState' }
  | { type: 'historySetPaused'; paused: boolean; csrf: string }
  | { type: 'historyClear'; csrf: string }
  | { type: 'historyDelete'; oid: number; business: string; csrf: string }

export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}
