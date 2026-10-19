interface BiliEnvelope<T> {
  code: number
  message?: string
  data: T
}

interface VideoDetail {
  aid: number
  cid: number
  duration?: number
}

interface DashVideo {
  id?: number
  codecid?: number
  baseUrl?: string
  base_url?: string
  backupUrl?: string[]
  backup_url?: string[]
}

interface PlayUrlData {
  dash?: {
    video?: DashVideo[]
  }
  durl?: Array<{
    url?: string
    backup_url?: string[]
  }>
}

interface NavData {
  isLogin: boolean
  mid: number
}

interface FavoriteFolderRaw {
  id?: number
  title?: string
  media_count?: number
}

interface FavoriteFolderData {
  list?: FavoriteFolderRaw[]
}

interface FavoriteFolder {
  id: number
  title: string
  mediaCount: number
}

class BiliApiError extends Error {
  constructor(public code: number, message: string) {
    super(message || `Bilibili API error ${code}`)
  }
}

const API = 'https://api.bilibili.com'
const PREVIEW_DELAY = 650
const PREVIEW_URL_TTL = 30 * 60 * 1000
const DETAIL_TTL = 30 * 60 * 1000
const FOLDER_TTL = 60 * 1000

const detailCache = new Map<string, { value: VideoDetail, expiresAt: number }>()
const previewCache = new Map<string, { url: string, expiresAt: number }>()
let folderCache: { value: FavoriteFolder[], expiresAt: number } | null = null
let userMidCache: number | null = null

let activeRoot: ShadowRoot | null = null
let appShell: HTMLElement | null = null
let activeMenu: HTMLElement | null = null
let activeMenuButton: HTMLButtonElement | null = null
let activeMenuCard: HTMLElement | null = null
let hoveredCard: HTMLElement | null = null
let hoverTimer: number | null = null
let hoverToken = 0
let toastTimer: number | null = null

const enhancementCss = `
.video-card {
  position: relative;
}

.video-card .thumbnail-link,
.video-card:hover .thumbnail-link {
  border-radius: 12px !important;
  transition: none !important;
}

.video-card .thumbnail {
  border-radius: inherit;
}

.byt-hover-preview {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: block;
  border-radius: inherit;
  object-fit: cover;
  background: #000;
  opacity: 0;
  transition: opacity 160ms ease;
}

.byt-hover-preview.is-ready {
  opacity: 1;
}

.video-card .more-button.is-active {
  opacity: 1 !important;
  background: var(--surface-2);
}

.byt-card-menu {
  --byt-menu-bg: #fff;
  --byt-menu-hover: #f2f2f2;
  --byt-menu-text: #0f0f0f;
  --byt-menu-muted: #606060;
  --byt-menu-border: #e5e5e5;

  position: fixed;
  z-index: 200;
  width: 286px;
  max-height: min(520px, calc(100vh - 24px));
  overflow-y: auto;
  padding: 8px 0;
  border: 1px solid rgb(0 0 0 / 8%);
  border-radius: 12px;
  background: var(--byt-menu-bg);
  color: var(--byt-menu-text);
  box-shadow: 0 4px 32px rgb(0 0 0 / 22%);
  font-family: Roboto, Arial, "Noto Sans SC", sans-serif;
  scrollbar-width: thin;
  scrollbar-color: var(--byt-menu-muted) transparent;
}

.byt-card-menu[hidden] {
  display: none !important;
}

.byt-card-menu-item,
.byt-card-menu-back,
.byt-playlist-folder {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  border: 0;
  color: var(--byt-menu-text);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  text-align: left;
}

.byt-card-menu-item:hover,
.byt-card-menu-item:focus-visible,
.byt-card-menu-back:hover,
.byt-card-menu-back:focus-visible,
.byt-playlist-folder:hover,
.byt-playlist-folder:focus-visible {
  outline: 0;
  background: var(--byt-menu-hover);
}

.byt-card-menu-item:disabled,
.byt-playlist-folder:disabled {
  cursor: wait;
  opacity: .58;
}

.byt-card-menu-icon {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.byt-card-menu-copy {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.byt-card-menu-divider {
  height: 1px;
  margin: 8px 0;
  background: var(--byt-menu-border);
}

.byt-card-menu-header {
  min-height: 48px;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 4px;
  padding: 0 8px;
}

.byt-card-menu-header strong {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.byt-card-menu-back {
  width: 40px;
  min-height: 40px;
  justify-content: center;
  gap: 0;
  padding: 0;
  border-radius: 50%;
}

.byt-playlist-status {
  min-height: 68px;
  display: grid;
  place-items: center;
  padding: 12px 18px;
  color: var(--byt-menu-muted);
  font-size: 13px;
  text-align: center;
}

.byt-playlist-folder {
  min-height: 48px;
}

.byt-playlist-folder-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.byt-playlist-folder-copy strong,
.byt-playlist-folder-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.byt-playlist-folder-copy strong {
  font-size: 14px;
  font-weight: 500;
}

.byt-playlist-folder-copy small {
  color: var(--byt-menu-muted);
  font-size: 12px;
}

.byt-card-toast {
  position: fixed;
  z-index: 240;
  left: 50%;
  bottom: 28px;
  max-width: min(520px, calc(100vw - 32px));
  transform: translateX(-50%);
  padding: 12px 16px;
  border-radius: 4px;
  background: #212121;
  color: #fff;
  box-shadow: 0 2px 8px rgb(0 0 0 / 28%);
  font-family: Roboto, Arial, "Noto Sans SC", sans-serif;
  font-size: 14px;
  line-height: 20px;
}

@media (prefers-color-scheme: dark) {
  .byt-card-menu {
    --byt-menu-bg: #282828;
    --byt-menu-hover: #3f3f3f;
    --byt-menu-text: #f1f1f1;
    --byt-menu-muted: #aaa;
    --byt-menu-border: #454545;
    border-color: rgb(255 255 255 / 8%);
  }
}
`

const iconPaths: Record<string, string> = {
  later: 'M12 7v5l3 2M4 3h16v18H4z',
  playlist: 'M4 6h12M4 11h12M4 16h8m7-4v7m-3-3h6',
  link: 'M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1',
  eyeOff: 'M3 3l18 18M10.6 10.6A2 2 0 0 0 13.4 13.4M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 8 9 8a15.6 15.6 0 0 1-2.2 3.2M6.6 6.6C4.2 8.1 3 12 3 12s3.5 8 9 8a9.8 9.8 0 0 0 3.4-.6',
  block: 'M4 4l16 16M20 4 4 20M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  back: 'm15 18-6-6 6-6',
  folder: 'M3 6h7l2 2h9v11H3z',
}

function normalizeUrl(url = ''): string {
  if (url.startsWith('//'))
    return `https:${url}`
  return url.replace(/^http:\/\//, 'https://')
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json, text/plain, */*' },
  })
  if (!response.ok)
    throw new Error(`HTTP ${response.status}`)
  const envelope = await response.json() as BiliEnvelope<T>
  if (envelope.code !== 0)
    throw new BiliApiError(envelope.code, envelope.message || `Bilibili API error ${envelope.code}`)
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
    throw new BiliApiError(envelope.code, envelope.message || `Bilibili API error ${envelope.code}`)
  return envelope.data
}

function bvidFromCard(card: HTMLElement): string | null {
  const anchor = card.querySelector<HTMLAnchorElement>('a[href*="/video/BV"]')
  const match = anchor?.href.match(/\/video\/(BV[0-9A-Za-z]+)/i)
  return match?.[1] ?? null
}

function channelMidFromCard(card: HTMLElement): number | null {
  const anchor = card.querySelector<HTMLAnchorElement>('a[href*="space.bilibili.com/"]')
  const match = anchor?.href.match(/space\.bilibili\.com\/(\d+)/)
  const mid = Number(match?.[1] ?? 0)
  return mid > 0 ? mid : null
}

function videoLinkFromCard(card: HTMLElement): string | null {
  const bvid = bvidFromCard(card)
  return bvid ? `https://www.bilibili.com/video/${bvid}` : null
}

function getCsrfToken(): string {
  const entry = document.cookie.split('; ').find(value => value.startsWith('bili_jct='))
  if (!entry)
    return ''
  const raw = entry.slice('bili_jct='.length)
  try {
    return decodeURIComponent(raw)
  }
  catch {
    return raw
  }
}

async function getVideoDetail(bvid: string): Promise<VideoDetail> {
  const cached = detailCache.get(bvid)
  if (cached && cached.expiresAt > Date.now())
    return cached.value

  const detail = await getJson<VideoDetail>(`${API}/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`)
  if (!detail.aid || !detail.cid)
    throw new Error('视频信息不完整')
  detailCache.set(bvid, { value: detail, expiresAt: Date.now() + DETAIL_TTL })
  return detail
}

function dashUrl(data: PlayUrlData): string {
  const videos = data.dash?.video ?? []
  const compatible = videos.find(item => item.codecid === 7) ?? videos[0]
  if (compatible) {
    const primary = compatible.baseUrl || compatible.base_url
    const backup = compatible.backupUrl?.[0] || compatible.backup_url?.[0]
    if (primary || backup)
      return normalizeUrl(primary || backup || '')
  }
  const progressive = data.durl?.[0]
  return normalizeUrl(progressive?.url || progressive?.backup_url?.[0] || '')
}

async function getPreviewUrl(bvid: string): Promise<string> {
  const cached = previewCache.get(bvid)
  if (cached && cached.expiresAt > Date.now())
    return cached.url

  const detail = await getVideoDetail(bvid)
  const dashParams = new URLSearchParams({
    bvid,
    cid: String(detail.cid),
    qn: '32',
    fnver: '0',
    fnval: '16',
    fourk: '0',
    platform: 'html5',
  })
  let data = await getJson<PlayUrlData>(`${API}/x/player/playurl?${dashParams}`)
  let url = dashUrl(data)

  if (!url) {
    const progressiveParams = new URLSearchParams({
      bvid,
      cid: String(detail.cid),
      qn: '32',
      fnver: '0',
      fnval: '0',
      fourk: '0',
      platform: 'html5',
    })
    data = await getJson<PlayUrlData>(`${API}/x/player/playurl?${progressiveParams}`)
    url = dashUrl(data)
  }

  if (!url)
    throw new Error('没有可用的预览流')
  previewCache.set(bvid, { url, expiresAt: Date.now() + PREVIEW_URL_TTL })
  return url
}

async function getUserMid(): Promise<number> {
  if (userMidCache)
    return userMidCache
  const nav = await getJson<NavData>(`${API}/x/web-interface/nav`)
  if (!nav.isLogin || !nav.mid)
    throw new Error('请先登录 Bilibili')
  userMidCache = nav.mid
  return nav.mid
}

async function getFavoriteFolders(): Promise<FavoriteFolder[]> {
  if (folderCache && folderCache.expiresAt > Date.now())
    return folderCache.value
  const mid = await getUserMid()
  const params = new URLSearchParams({ up_mid: String(mid), type: '2' })
  const data = await getJson<FavoriteFolderData>(`${API}/x/v3/fav/folder/created/list-all?${params}`)
  const folders = (data.list ?? [])
    .filter((item): item is FavoriteFolderRaw & { id: number, title: string } => Boolean(item.id && item.title))
    .map(item => ({ id: item.id, title: item.title, mediaCount: item.media_count ?? 0 }))
  folderCache = { value: folders, expiresAt: Date.now() + FOLDER_TTL }
  return folders
}

async function addWatchLater(bvid: string) {
  const csrf = getCsrfToken()
  if (!csrf)
    throw new Error('请先登录 Bilibili')
  await postForm(`${API}/x/v2/history/toview/add`, { bvid, csrf })
}

async function addFavorite(bvid: string, mediaId: number) {
  const csrf = getCsrfToken()
  if (!csrf)
    throw new Error('请先登录 Bilibili')
  const detail = await getVideoDetail(bvid)
  await postForm(`${API}/x/v3/fav/resource/deal`, {
    rid: String(detail.aid),
    type: '2',
    add_media_ids: String(mediaId),
    del_media_ids: '',
    platform: 'web',
    csrf,
  })
}

function makeIcon(name: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('byt-card-menu-icon')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', iconPaths[name] || iconPaths.folder!)
  svg.append(path)
  return svg
}

function showToast(message: string) {
  if (!appShell)
    return
  appShell.querySelector('.byt-card-toast')?.remove()
  if (toastTimer !== null)
    window.clearTimeout(toastTimer)
  const toast = document.createElement('div')
  toast.className = 'byt-card-toast'
  toast.setAttribute('role', 'status')
  toast.textContent = message
  appShell.append(toast)
  toastTimer = window.setTimeout(() => {
    toast.remove()
    toastTimer = null
  }, 2600)
}

function stopPreview(card: HTMLElement | null) {
  if (!card)
    return
  const preview = card.querySelector<HTMLVideoElement>('.byt-hover-preview')
  if (!preview)
    return
  preview.pause()
  preview.removeAttribute('src')
  try {
    preview.load()
  }
  catch {
    // The element may already be detaching while navigation occurs.
  }
  preview.remove()
}

function cancelHoverPreview() {
  hoverToken += 1
  if (hoverTimer !== null) {
    window.clearTimeout(hoverTimer)
    hoverTimer = null
  }
  stopPreview(hoveredCard)
  hoveredCard = null
}

async function mountPreview(card: HTMLElement, token: number) {
  const bvid = bvidFromCard(card)
  const thumbnail = card.querySelector<HTMLAnchorElement>('.thumbnail-link')
  if (!bvid || !thumbnail)
    return

  try {
    const url = await getPreviewUrl(bvid)
    if (token !== hoverToken || hoveredCard !== card || !card.isConnected)
      return

    stopPreview(card)
    const preview = document.createElement('video')
    preview.className = 'byt-hover-preview'
    preview.src = url
    preview.muted = true
    preview.autoplay = true
    preview.loop = true
    preview.playsInline = true
    preview.preload = 'metadata'
    preview.setAttribute('aria-hidden', 'true')
    preview.addEventListener('loadedmetadata', () => {
      if (token !== hoverToken || hoveredCard !== card)
        return
      if (Number.isFinite(preview.duration) && preview.duration > 8) {
        const target = Math.min(20, Math.max(3, preview.duration * 0.08))
        try {
          preview.currentTime = target
        }
        catch {
          // Some media sources do not allow seeking before enough data is buffered.
        }
      }
    }, { once: true })
    preview.addEventListener('canplay', () => {
      if (token !== hoverToken || hoveredCard !== card)
        return
      preview.classList.add('is-ready')
      void preview.play().catch(() => {})
    }, { once: true })
    preview.addEventListener('error', () => {
      if (preview.isConnected)
        preview.remove()
    }, { once: true })
    thumbnail.append(preview)
  }
  catch (error) {
    console.debug('[BiliYouTube] hover preview unavailable', bvid, error)
  }
}

function beginHoverPreview(card: HTMLElement) {
  cancelHoverPreview()
  if (activeMenuCard === card)
    return
  hoveredCard = card
  const token = ++hoverToken
  hoverTimer = window.setTimeout(() => {
    hoverTimer = null
    void mountPreview(card, token)
  }, PREVIEW_DELAY)
}

function closeMenu() {
  activeMenu?.remove()
  activeMenu = null
  activeMenuButton?.classList.remove('is-active')
  activeMenuButton = null
  activeMenuCard = null
}

function positionMenu(menu: HTMLElement, button: HTMLElement) {
  requestAnimationFrame(() => {
    if (!menu.isConnected)
      return
    const rect = button.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const margin = 8
    let left = rect.right - menuRect.width
    left = Math.max(margin, Math.min(left, window.innerWidth - menuRect.width - margin))
    let top = rect.bottom + 8
    if (top + menuRect.height > window.innerHeight - margin)
      top = Math.max(margin, rect.top - menuRect.height - 8)
    menu.style.left = `${Math.round(left)}px`
    menu.style.top = `${Math.round(top)}px`
  })
}

function makeMenuItem(label: string, icon: string, action: (button: HTMLButtonElement) => void | Promise<void>): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'byt-card-menu-item'
  button.setAttribute('role', 'menuitem')
  button.append(makeIcon(icon))
  const copy = document.createElement('span')
  copy.className = 'byt-card-menu-copy'
  copy.textContent = label
  button.append(copy)
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void action(button)
  })
  return button
}

function appendDivider(menu: HTMLElement) {
  const divider = document.createElement('div')
  divider.className = 'byt-card-menu-divider'
  divider.setAttribute('role', 'separator')
  menu.append(divider)
}

async function copyVideoLink(card: HTMLElement) {
  const url = videoLinkFromCard(card)
  if (!url)
    return
  try {
    await navigator.clipboard.writeText(url)
  }
  catch {
    const area = document.createElement('textarea')
    area.value = url
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
  closeMenu()
  showToast('已复制视频链接')
}

function removeCurrentRecommendation(card: HTMLElement) {
  closeMenu()
  stopPreview(card)
  card.remove()
  showToast('已从当前推荐中移除')
}

function removeChannelRecommendations(card: HTMLElement) {
  const mid = channelMidFromCard(card)
  if (!mid || !activeRoot) {
    removeCurrentRecommendation(card)
    return
  }
  closeMenu()
  for (const candidate of activeRoot.querySelectorAll<HTMLElement>('.video-card')) {
    if (channelMidFromCard(candidate) === mid) {
      stopPreview(candidate)
      candidate.remove()
    }
  }
  showToast('本次浏览不再显示该频道的推荐')
}

function showPlaylistPicker(menu: HTMLElement, card: HTMLElement, button: HTMLElement) {
  const bvid = bvidFromCard(card)
  if (!bvid)
    return

  menu.replaceChildren()
  const header = document.createElement('div')
  header.className = 'byt-card-menu-header'
  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'byt-card-menu-back'
  back.setAttribute('aria-label', '返回')
  back.append(makeIcon('back'))
  const title = document.createElement('strong')
  title.textContent = '保存到播放列表'
  header.append(back, title)
  menu.append(header)

  const status = document.createElement('div')
  status.className = 'byt-playlist-status'
  status.textContent = '正在加载播放列表…'
  menu.append(status)
  positionMenu(menu, button)

  back.addEventListener('click', (event) => {
    event.stopPropagation()
    openMenu(button as HTMLButtonElement, card)
  })

  void (async () => {
    try {
      const folders = await getFavoriteFolders()
      if (activeMenu !== menu || activeMenuCard !== card)
        return
      status.remove()
      if (!folders.length) {
        const empty = document.createElement('div')
        empty.className = 'byt-playlist-status'
        empty.textContent = '没有可用的播放列表。'
        menu.append(empty)
        positionMenu(menu, button)
        return
      }
      for (const folder of folders) {
        const row = document.createElement('button')
        row.type = 'button'
        row.className = 'byt-playlist-folder'
        row.append(makeIcon('folder'))
        const copy = document.createElement('span')
        copy.className = 'byt-playlist-folder-copy'
        const name = document.createElement('strong')
        name.textContent = folder.title
        const count = document.createElement('small')
        count.textContent = `${folder.mediaCount} 个视频`
        copy.append(name, count)
        row.append(copy)
        row.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          row.disabled = true
          void (async () => {
            try {
              await addFavorite(bvid, folder.id)
              closeMenu()
              folderCache = null
              showToast(`已保存到“${folder.title}”`)
            }
            catch (error) {
              const message = error instanceof BiliApiError && (error.code === 11202 || error.code === 11015)
                ? '这个视频已经在该播放列表中'
                : error instanceof Error ? error.message : '保存失败'
              showToast(message)
              row.disabled = false
            }
          })()
        })
        menu.append(row)
      }
      positionMenu(menu, button)
    }
    catch (error) {
      if (activeMenu !== menu)
        return
      status.textContent = error instanceof Error ? error.message : '播放列表加载失败'
      positionMenu(menu, button)
    }
  })()
}

function openMenu(button: HTMLButtonElement, card: HTMLElement) {
  if (!appShell)
    return
  if (activeMenuButton === button) {
    closeMenu()
    return
  }

  closeMenu()
  cancelHoverPreview()
  activeMenuButton = button
  activeMenuCard = card
  button.classList.add('is-active')

  const menu = document.createElement('div')
  menu.className = 'byt-card-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', '视频操作')

  menu.append(makeMenuItem('稍后再看', 'later', async (row) => {
    const bvid = bvidFromCard(card)
    if (!bvid)
      return
    row.disabled = true
    try {
      await addWatchLater(bvid)
      closeMenu()
      showToast('已添加到稍后再看')
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '添加失败'
      showToast(message)
      row.disabled = false
    }
  }))

  menu.append(makeMenuItem('保存到播放列表', 'playlist', () => {
    showPlaylistPicker(menu, card, button)
  }))

  appendDivider(menu)
  menu.append(makeMenuItem('复制视频链接', 'link', () => copyVideoLink(card)))
  appendDivider(menu)
  menu.append(makeMenuItem('不感兴趣', 'eyeOff', () => removeCurrentRecommendation(card)))
  menu.append(makeMenuItem('不推荐此频道', 'block', () => removeChannelRecommendations(card)))

  appShell.append(menu)
  activeMenu = menu
  positionMenu(menu, button)
}

function onPointerOver(event: Event) {
  if (!(event instanceof PointerEvent) || (event.pointerType && event.pointerType !== 'mouse'))
    return
  const target = event.target
  if (!(target instanceof Element))
    return
  const card = target.closest<HTMLElement>('.video-card')
  if (!card)
    return
  const related = event.relatedTarget
  if (related instanceof Node && card.contains(related))
    return
  beginHoverPreview(card)
}

function onPointerOut(event: Event) {
  if (!(event instanceof PointerEvent) || (event.pointerType && event.pointerType !== 'mouse'))
    return
  const target = event.target
  if (!(target instanceof Element))
    return
  const card = target.closest<HTMLElement>('.video-card')
  if (!card || hoveredCard !== card)
    return
  const related = event.relatedTarget
  if (related instanceof Node && card.contains(related))
    return
  cancelHoverPreview()
}

function onRootClick(event: Event) {
  if (!(event instanceof MouseEvent) || event.button !== 0)
    return
  const path = event.composedPath()
  const button = path.find(node => node instanceof HTMLButtonElement && node.classList.contains('more-button')) as HTMLButtonElement | undefined
  if (button) {
    const card = button.closest<HTMLElement>('.video-card')
    if (!card)
      return
    event.preventDefault()
    event.stopPropagation()
    openMenu(button, card)
    return
  }

  if (activeMenu && !path.includes(activeMenu) && (!activeMenuButton || !path.includes(activeMenuButton)))
    closeMenu()
}

function onRootPointerDown(event: Event) {
  if (!activeMenu)
    return
  const path = event.composedPath()
  if (!path.includes(activeMenu) && (!activeMenuButton || !path.includes(activeMenuButton)))
    closeMenu()
}

function install(root: ShadowRoot) {
  activeRoot = root
  appShell = root.querySelector<HTMLElement>('.app-shell')
  if (!appShell)
    return

  if (!root.querySelector('style[data-byt-card-interactions]')) {
    const style = document.createElement('style')
    style.dataset.bytCardInteractions = 'true'
    style.textContent = enhancementCss
    root.append(style)
  }

  root.addEventListener('pointerover', onPointerOver, true)
  root.addEventListener('pointerout', onPointerOut, true)
  root.addEventListener('click', onRootClick, true)
  root.addEventListener('pointerdown', onRootPointerDown, true)
}

function uninstall() {
  cancelHoverPreview()
  closeMenu()
  if (activeRoot) {
    activeRoot.removeEventListener('pointerover', onPointerOver, true)
    activeRoot.removeEventListener('pointerout', onPointerOut, true)
    activeRoot.removeEventListener('click', onRootClick, true)
    activeRoot.removeEventListener('pointerdown', onRootPointerDown, true)
    activeRoot.querySelector('style[data-byt-card-interactions]')?.remove()
  }
  appShell?.querySelector('.byt-card-toast')?.remove()
  if (toastTimer !== null)
    window.clearTimeout(toastTimer)
  toastTimer = null
  activeRoot = null
  appShell = null
}

function findBiliYouTubeRoot(): ShadowRoot | null {
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
    const root = element.shadowRoot
    if (root?.querySelector('.app-shell .feed-grid'))
      return root
  }
  return null
}

export default defineContentScript({
  matches: ['https://www.bilibili.com/*'],
  runAt: 'document_start',
  async main(ctx) {
    if (location.pathname !== '/' && location.pathname !== '')
      return

    const existing = findBiliYouTubeRoot()
    if (existing) {
      install(existing)
    }
    else {
      const observer = new MutationObserver(() => {
        const root = findBiliYouTubeRoot()
        if (!root)
          return
        observer.disconnect()
        install(root)
      })
      observer.observe(document.documentElement, { childList: true, subtree: true })
      ctx.onInvalidated(() => observer.disconnect())
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        closeMenu()
    }
    window.addEventListener('keydown', onEscape)

    ctx.onInvalidated(() => {
      window.removeEventListener('keydown', onEscape)
      uninstall()
    })
  },
})
