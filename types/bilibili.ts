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

export type ApiRequest =
  | { type: 'user' }
  | { type: 'feed'; page?: number }
  | { type: 'following'; mid: number; page?: number }

export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}
