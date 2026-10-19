import { callApi } from '../lib/api'
import type { BiliFollowing, BiliUser } from '../types/bilibili'
import './watch.css'

const SVG_NS = 'http://www.w3.org/2000/svg'
const markerClasses = [
  'byt-native-player', 'byt-native-info', 'byt-native-up', 'byt-native-toolbar',
  'byt-native-desc', 'byt-native-comments', 'byt-native-related', 'byt-native-left',
]

const paths: Record<string, string> = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  dynamic: 'M4 6h16v12H4zM8 10h8M8 14h5',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  playlist: 'M4 6h12M4 11h12M4 16h8m7-4v7m-3-3h6',
  later: 'M12 7v5l3 2M4 3h16v18H4z',
  search: 'm21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M5 20h14',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  down: 'm6 9 6 6 6-6',
  up: 'm6 15 6-6 6 6',
  close: 'M6 6l12 12M18 6 6 18',
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className)
    node.className = className
  return node
}

function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', paths[name] ?? paths.home!)
  svg.append(path)
  return svg
}

function iconButton(label: string, name: string): HTMLButtonElement {
  const node = el('button', 'byt-watch-icon-button')
  node.type = 'button'
  node.setAttribute('aria-label', label)
  node.append(icon(name))
  return node
}

function navLink(label: string, href: string, name: string): HTMLAnchorElement {
  const node = el('a', 'byt-watch-nav-item')
  node.href = href
  node.append(icon(name))
  const text = el('span')
  text.textContent = label
  node.append(text)
  return node
}

async function waitForBody(): Promise<HTMLElement> {
  if (document.body)
    return document.body
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

function first(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector)
    if (node)
      return node
  }
  return null
}

function clearMarkers() {
  for (const className of markerClasses)
    document.querySelectorAll(`.${className}`).forEach(node => node.classList.remove(className))
}

let observedPlayer: HTMLElement | null = null
let playerObserver: MutationObserver | null = null

function updatePlayerMode() {
  const screen = document.querySelector<HTMLElement>('.bpx-player-container')?.dataset.screen ?? ''
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
  playerObserver?.disconnect()
  observedPlayer = player
  playerObserver = null
  if (player) {
    playerObserver = new MutationObserver(updatePlayerMode)
    playerObserver.observe(player, { attributes: true, attributeFilter: ['data-screen'] })
  }
  updatePlayerMode()
}

function decorateNativePage() {
  clearMarkers()
  const player = first(['#playerWrap', '#bilibili-player', '#bilibiliPlayer', '.bpx-player-container'])
  player?.classList.add('byt-native-player')
  first(['.video-info-container', '#viewbox_report', '.video-info-v1'])?.classList.add('byt-native-info')
  first(['.up-panel-container', '.up-info-container', '#upinfo'])?.classList.add('byt-native-up')
  first(['#arc_toolbar_report', '.video-toolbar-container', '.video-toolbar-v1'])?.classList.add('byt-native-toolbar')
  first(['#v_desc', '.video-desc-container', '.desc-info'])?.classList.add('byt-native-desc')
  first(['#comment-module', '#comment-body', '#commentapp', '.comment-container'])?.classList.add('byt-native-comments')
  first(['.right-container', '.recommend-list-v1', '.recommend-list-container'])?.classList.add('byt-native-related')

  const left = first(['.left-container', '.left-container-under-player', '.video-left-container'])
  if (left && (!player || left.contains(player)))
    left.classList.add('byt-native-left')
  observePlayerMode()
}

function buildBrand(): HTMLAnchorElement {
  const brand = el('a', 'byt-watch-brand')
  brand.href = 'https://www.bilibili.com/'
  brand.setAttribute('aria-label', 'BiliYouTube 首页')
  const mark = el('span', 'byt-watch-brand-mark')
  mark.textContent = '▶'
  const text = el('span', 'byt-watch-brand-text')
  text.textContent = 'BiliYouTube'
  brand.append(mark, text)
  return brand
}

function buildChrome() {
  if (document.getElementById('biliyoutube-watch-chrome'))
    return

  const root = el('div', 'byt-watch-chrome')
  root.id = 'biliyoutube-watch-chrome'
  const topbar = el('header', 'byt-watch-topbar')
  const topLeft = el('div', 'byt-watch-topbar-left')
  const menu = iconButton('菜单', 'menu')
  topLeft.append(menu, buildBrand())

  const search = el('form', 'byt-watch-search')
  const input = el('input')
  input.type = 'search'
  input.placeholder = '搜索'
  input.autocomplete = 'off'
  const searchButton = iconButton('搜索', 'search')
  searchButton.className = 'byt-watch-search-button'
  searchButton.type = 'submit'
  search.append(input, searchButton)
  search.addEventListener('submit', (event) => {
    event.preventDefault()
    const keyword = input.value.trim()
    if (keyword)
      location.href = `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`
  })

  const actions = el('div', 'byt-watch-topbar-actions')
  const create = el('a', 'byt-watch-create')
  create.href = 'https://member.bilibili.com/platform/upload/video/frame'
  create.append(icon('upload'))
  const createText = el('span')
  createText.textContent = '投稿'
  create.append(createText)
  const messages = el('a', 'byt-watch-icon-button')
  messages.href = 'https://message.bilibili.com/'
  messages.setAttribute('aria-label', '消息')
  messages.append(icon('bell'))
  const account = el('div', 'byt-watch-account-slot')
  actions.append(create, messages, account)
  topbar.append(topLeft, search, actions)

  const backdrop = el('button', 'byt-watch-drawer-backdrop')
  backdrop.type = 'button'
  backdrop.setAttribute('aria-label', '关闭菜单')
  const drawer = el('aside', 'byt-watch-drawer')
  const drawerHeader = el('div', 'byt-watch-drawer-header')
  const close = iconButton('关闭菜单', 'close')
  drawerHeader.append(close, buildBrand())
  const drawerBody = el('div', 'byt-watch-drawer-body')

  const primary = el('nav', 'byt-watch-drawer-group')
  primary.append(
    navLink('首页', 'https://www.bilibili.com/', 'home'),
    navLink('动态', 'https://t.bilibili.com/', 'dynamic'),
  )
  const library = el('nav', 'byt-watch-drawer-group')
  const you = el('h2', 'byt-watch-drawer-heading')
  you.textContent = '你'
  library.append(
    you,
    navLink('历史记录', 'https://www.bilibili.com/#biliyoutube/history', 'history'),
    navLink('播放列表', 'https://www.bilibili.com/#biliyoutube/favorites', 'playlist'),
    navLink('稍后再看', 'https://www.bilibili.com/#biliyoutube/watch-later', 'later'),
  )
  const subscriptions = el('section', 'byt-watch-subscriptions')
  const subHeading = el('h2', 'byt-watch-drawer-heading')
  subHeading.textContent = '订阅'
  const subList = el('div', 'byt-watch-subscription-list')
  subscriptions.append(subHeading, subList)
  drawerBody.append(primary, library, subscriptions)
  drawer.append(drawerHeader, drawerBody)
  root.append(topbar, backdrop, drawer)
  document.body.append(root)

  const toggleDrawer = (open: boolean) => {
    root.classList.toggle('drawer-open', open)
    document.documentElement.classList.toggle('byt-watch-drawer-open', open)
  }
  menu.addEventListener('click', () => toggleDrawer(true))
  close.addEventListener('click', () => toggleDrawer(false))
  backdrop.addEventListener('click', () => toggleDrawer(false))
  drawer.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a'))
      toggleDrawer(false)
  })
  void populateAccount(account, subList)
}

async function populateAccount(account: HTMLElement, subList: HTMLElement) {
  try {
    const user = await callApi<BiliUser | null>({ type: 'user' })
    if (!user) {
      const login = el('a', 'byt-watch-login')
      login.href = 'https://passport.bilibili.com/login'
      login.textContent = '登录'
      account.replaceChildren(login)
      return
    }

    const avatar = el('a', 'byt-watch-avatar')
    avatar.href = `https://space.bilibili.com/${user.mid}`
    const image = el('img')
    image.src = user.face
    image.alt = user.name
    avatar.append(image)
    account.replaceChildren(avatar)

    const following = await callApi<BiliFollowing[]>({ type: 'following', mid: user.mid, page: 1 })
    renderSubscriptions(subList, following)
  }
  catch (error) {
    console.debug('[BiliYouTube] watch chrome account data unavailable', error)
  }
}

function renderSubscriptions(container: HTMLElement, following: BiliFollowing[]) {
  let expanded = false
  const render = () => {
    container.replaceChildren()
    for (const channel of (expanded ? following : following.slice(0, 7))) {
      const item = el('a', 'byt-watch-subscription')
      item.href = `https://space.bilibili.com/${channel.mid}`
      const image = el('img')
      image.src = channel.face
      image.alt = channel.uname
      const name = el('span')
      name.textContent = channel.uname
      item.append(image, name)
      container.append(item)
    }
    if (following.length > 7) {
      const more = el('button', 'byt-watch-show-more')
      more.type = 'button'
      more.append(icon(expanded ? 'up' : 'down'))
      const text = el('span')
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

function updateFullscreen() {
  document.documentElement.classList.toggle('byt-watch-browser-full', Boolean(document.fullscreenElement))
}

export default defineContentScript({
  matches: ['https://www.bilibili.com/video/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',
  async main(ctx) {
    await waitForBody()
    document.documentElement.classList.add('byt-watch-page')
    buildChrome()
    decorateNativePage()
    updateFullscreen()

    let scheduled = false
    const observer = new MutationObserver(() => {
      if (scheduled)
        return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        decorateNativePage()
      })
    })
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('fullscreenchange', updateFullscreen)

    ctx.onInvalidated(() => {
      observer.disconnect()
      playerObserver?.disconnect()
      playerObserver = null
      observedPlayer = null
      document.removeEventListener('fullscreenchange', updateFullscreen)
      document.getElementById('biliyoutube-watch-chrome')?.remove()
      clearMarkers()
      document.documentElement.classList.remove(
        'byt-watch-page', 'byt-watch-wide', 'byt-watch-web-full',
        'byt-watch-browser-full', 'byt-watch-drawer-open',
      )
    })
  },
})
