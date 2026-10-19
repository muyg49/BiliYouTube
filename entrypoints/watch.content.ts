import { callApi } from '../lib/api'
import type { BiliFollowing, BiliUser } from '../types/bilibili'
import './watch.css'

const SVG_NS = 'http://www.w3.org/2000/svg'
const MARKERS = [
  'byt-native-player',
  'byt-native-info',
  'byt-native-up',
  'byt-native-toolbar',
  'byt-native-desc',
  'byt-native-comments',
  'byt-native-related',
  'byt-native-left',
] as const

const ICONS: Record<string, string> = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  dynamic: 'M4 6h16v12H4zM8 10h8M8 14h5',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  playlist: 'M4 6h12M4 11h12M4 16h8m7-4v7m-3-3h6',
  later: 'M12 7v5l3 2M4 3h16v18H4z',
  search: 'm21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M5 20h14',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  chevronDown: 'm6 9 6 6 6-6',
  chevronUp: 'm6 15 6-6 6 6',
  close: 'M6 6l12 12M18 6 6 18',
}

function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', ICONS[name] ?? ICONS.home!)
  svg.append(path)
  return svg
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className)
    node.className = className
  return node
}

function link(label: string, href: string, iconName?: string): HTMLAnchorElement {
  const node = element('a', 'byt-watch-nav-item')
  node.href = href
  if (iconName)
    node.append(icon(iconName))
  const span = element('span')
  span.textContent = label
  node.append(span)
  return node
}

function button(label: string, className: string, iconName?: string): HTMLButtonElement {
  const node = element('button', className)
  node.type = 'button'
  node.setAttribute('aria-label', label)
  if (iconName)
    node.append(icon(iconName))
  return node
}

function waitForBody(): Promise<HTMLBodyElement> {
  if (document.body)
    return Promise.resolve(document.body)

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.body)
        return
      observer.disconnect()
      resolve(document.body)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  })
}

function firstExisting(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector)
    if (node)
      return node
  }
  return null
}

function mark(node: HTMLElement | null, className: string) {
  node?.classList.add(className)
}

function clearMarkers() {
  for (const className of MARKERS) {
    document.querySelectorAll(`.${className}`).forEach(node => node.classList.remove(className))
  }
}

function findPlayerHost(): HTMLElement | null {
  return firstExisting([
    '#playerWrap',
    '#bilibili-player',
    '#bilibiliPlayer',
    '.bpx-player-container',
  ])
}

function decorateNativeRegions() {
  clearMarkers()

  const player = findPlayerHost()
  mark(player, 'byt-native-player')

  const info = firstExisting([
    '.video-info-container',
    '#viewbox_report',
    '.video-info-v1',
  ])
  mark(info, 'byt-native-info')

  const up = firstExisting([
    '.up-panel-container',
    '.up-info-container',
    '#upinfo',
  ])
  mark(up, 'byt-native-up')

  const toolbar = firstExisting([
    '#arc_toolbar_report',
    '.video-toolbar-container',
    '.video-toolbar-v1',
  ])
  mark(toolbar, 'byt-native-toolbar')

  const desc = firstExisting([
    '#v_desc',
    '.video-desc-container',
    '.desc-info',
  ])
  mark(desc, 'byt-native-desc')

  const comments = firstExisting([
    '#comment-module',
    '#comment-body',
    '#commentapp',
    '.comment-container',
  ])
  mark(comments, 'byt-native-comments')

  const related = firstExisting([
    '.right-container',
    '.recommend-list-v1',
    '.recommend-list-container',
  ])
  mark(related, 'byt-native-related')

  let left = firstExisting([
    '.left-container',
    '.left-container-under-player',
    '.video-left-container',
  ])
  if (left && player && !left.contains(player))
    left = null
  mark(left, 'byt-native-left')

  observePlayerMode()
}

let playerModeObserver: MutationObserver | null = null
let observedPlayer: HTMLElement | null = null

function updatePlayerMode() {
  const player = document.querySelector<HTMLElement>('.bpx-player-container')
  const screen = player?.dataset.screen ?? ''
  const root = document.documentElement
  root.classList.toggle('byt-watch-wide', screen === 'wide')
  root.classList.toggle('byt-watch-web-full', screen === 'web' || screen === 'full')
}

function observePlayerMode() {
  const player = document.querySelector<HTMLElement>('.bpx-player-container')
  if (player === observedPlayer) {
    updatePlayerMode()
    return
  }

  playerModeObserver?.disconnect()
  playerModeObserver = null
  observedPlayer = player

  if (player) {
    playerModeObserver = new MutationObserver(updatePlayerMode)
    playerModeObserver.observe(player, { attributes: true, attributeFilter: ['data-screen'] })
  }
  updatePlayerMode()
}

function updateFullscreenState() {
  document.documentElement.classList.toggle('byt-watch-browser-full', Boolean(document.fullscreenElement))
}

function createChrome() {
  if (document.getElementById('biliyoutube-watch-chrome'))
    return

  const root = element('div', 'byt-watch-chrome')
  root.id = 'biliyoutube-watch-chrome'

  const topbar = element('header', 'byt-watch-topbar')
  const left = element('div', 'byt-watch-topbar-left')
  const menu = button('菜单', 'byt-watch-icon-button', 'menu')
  const brand = element('a', 'byt-watch-brand')
  brand.href = 'https://www.bilibili.com/'
  brand.setAttribute('aria-label', 'BiliYouTube 首页')
  const brandMark = element('span', 'byt-watch-brand-mark')
  brandMark.textContent = '▶'
  const brandText = element('span', 'byt-watch-brand-text')
  brandText.textContent = 'BiliYouTube'
  brand.append(brandMark, brandText)
  left.append(menu, brand)

  const search = element('form', 'byt-watch-search')
  const searchInput = element('input')
  searchInput.type = 'search'
  searchInput.placeholder = '搜索'
  searchInput.autocomplete = 'off'
  const searchButton = button('搜索', 'byt-watch-search-button', 'search')
  searchButton.type = 'submit'
  search.append(searchInput, searchButton)
  search.addEventListener('submit', (event) => {
    event.preventDefault()
    const keyword = searchInput.value.trim()
    if (keyword)
      window.location.href = `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`
  })

  const actions = element('div', 'byt-watch-topbar-actions')
  const create = element('a', 'byt-watch-create')
  create.href = 'https://member.bilibili.com/platform/upload/video/frame'
  create.append(icon('upload'))
  const createText = element('span')
  createText.textContent = '投稿'
  create.append(createText)

  const messages = element('a', 'byt-watch-icon-button')
  messages.href = 'https://message.bilibili.com/'
  messages.setAttribute('aria-label', '消息')
  messages.append(icon('bell'))

  const account = element('div', 'byt-watch-account-slot')
  actions.append(create, messages, account)
  topbar.append(left, search, actions)

  const backdrop = element('button', 'byt-watch-drawer-backdrop')
  backdrop.type = 'button'
  backdrop.setAttribute('aria-label', '关闭菜单')

  const drawer = element('aside', 'byt-watch-drawer')
  const drawerHeader = element('div', 'byt-watch-drawer-header')
  const close = button('关闭菜单', 'byt-watch-icon-button', 'close')
  const drawerBrand = brand.cloneNode(true) as HTMLAnchorElement
  drawerHeader.append(close, drawerBrand)

  const drawerBody = element('div', 'byt-watch-drawer-body')
  const primary = element('nav', 'byt-watch-drawer-group')
  primary.append(
    link('首页', 'https://www.bilibili.com/', 'home'),
    link('动态', 'https://t.bilibili.com/', 'dynamic'),
  )

  const library = element('nav', 'byt-watch-drawer-group')
  const youHeading = element('h2', 'byt-watch-drawer-heading')
  youHeading.textContent = '你'
  library.append(
    youHeading,
    link('历史记录', 'https://www.bilibili.com/#biliyoutube/history', 'history'),
    link('播放列表', 'https://www.bilibili.com/#biliyoutube/favorites', 'playlist'),
    link('稍后再看', 'https://www.bilibili.com/#biliyoutube/watch-later', 'later'),
  )

  const subscriptions = element('section', 'byt-watch-subscriptions')
  const subHeading = element('h2', 'byt-watch-drawer-heading')
  subHeading.textContent = '订阅'
  const subList = element('div', 'byt-watch-subscription-list')
  subscriptions.append(subHeading, subList)

  drawerBody.append(primary, library, subscriptions)
  drawer.append(drawerHeader, drawerBody)
  root.append(topbar, backdrop, drawer)
  document.body.append(root)

  const setDrawer = (open: boolean) => {
    root.classList.toggle('drawer-open', open)
    document.documentElement.classList.toggle('byt-watch-drawer-open', open)
  }
  menu.addEventListener('click', () => setDrawer(true))
  close.addEventListener('click', () => setDrawer(false))
  backdrop.addEventListener('click', () => setDrawer(false))
  drawer.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a'))
      setDrawer(false)
  })

  void populateAccount(account, subList)
}

async function populateAccount(accountSlot: HTMLElement, subscriptionList: HTMLElement) {
  try {
    const user = await callApi<BiliUser | null>({ type: 'user' })
    accountSlot.replaceChildren()

    if (!user) {
      const login = element('a', 'byt-watch-login')
      login.href = 'https://passport.bilibili.com/login'
      login.textContent = '登录'
      accountSlot.append(login)
      return
    }

    const avatar = element('a', 'byt-watch-avatar')
    avatar.href = `https://space.bilibili.com/${user.mid}`
    avatar.setAttribute('aria-label', user.name)
    const image = element('img')
    image.src = user.face
    image.alt = user.name
    avatar.append(image)
    accountSlot.append(avatar)

    const following = await callApi<BiliFollowing[]>({ type: 'following', mid: user.mid, page: 1 })
    renderSubscriptions(subscriptionList, following)
  }
  catch (error) {
    console.debug('[BiliYouTube] Could not populate watch chrome account data', error)
  }
}

function renderSubscriptions(container: HTMLElement, following: BiliFollowing[]) {
  let expanded = false

  const render = () => {
    container.replaceChildren()
    const visible = expanded ? following : following.slice(0, 7)
    for (const channel of visible) {
      const item = element('a', 'byt-watch-subscription')
      item.href = `https://space.bilibili.com/${channel.mid}`
      const image = element('img')
      image.src = channel.face
      image.alt = channel.uname
      const name = element('span')
      name.textContent = channel.uname
      item.append(image, name)
      container.append(item)
    }

    if (following.length > 7) {
      const more = button(expanded ? '收起' : '显示更多', 'byt-watch-show-more', expanded ? 'chevronUp' : 'chevronDown')
      const text = element('span')
      text.textContent = expanded ? '收起' : '显示更多'
      more.append(text)
      more.addEventListener('click', () => {
        expanded = !expanded
        render()
      })
      container.append(more)
    }
  }

  render()
}

export default defineContentScript({
  matches: ['https://www.bilibili.com/video/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',
  async main(ctx) {
    await waitForBody()

    document.documentElement.classList.add('byt-watch-page')
    createChrome()
    decorateNativeRegions()
    updateFullscreenState()

    let scheduled = false
    const observer = new MutationObserver(() => {
      if (scheduled)
        return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        decorateNativeRegions()
      })
    })
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('fullscreenchange', updateFullscreenState)

    ctx.onInvalidated(() => {
      observer.disconnect()
      playerModeObserver?.disconnect()
      playerModeObserver = null
      observedPlayer = null
      document.removeEventListener('fullscreenchange', updateFullscreenState)
      document.getElementById('biliyoutube-watch-chrome')?.remove()
      clearMarkers()
      document.documentElement.classList.remove(
        'byt-watch-page',
        'byt-watch-wide',
        'byt-watch-web-full',
        'byt-watch-browser-full',
        'byt-watch-drawer-open',
      )
    })
  },
})
