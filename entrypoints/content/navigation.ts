import { callApi } from '../../lib/api'
import type { BiliDynamicFilter, BiliDynamicItem, BiliDynamicPage, BiliUser } from '../../types/bilibili'

type InternalRoute =
  | { kind: 'dynamic' }
  | { kind: 'channel'; mid: number }

interface ChannelPreview {
  mid: number
  name: string
  face: string
}

export interface InternalNavigationBridge {
  destroy: () => void
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className)
    node.className = className
  return node
}

function text(node: HTMLElement, value: string) {
  node.textContent = value
  return node
}

function normalizeHref(href: string): string {
  try {
    return new URL(href, location.href).href
  }
  catch {
    return href
  }
}

function relativeTime(timestamp: number): string {
  if (!timestamp)
    return ''
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - timestamp))
  const units: Array<[number, string]> = [
    [31_536_000, '年前'],
    [2_592_000, '个月前'],
    [604_800, '周前'],
    [86_400, '天前'],
    [3_600, '小时前'],
    [60, '分钟前'],
  ]
  for (const [size, label] of units) {
    if (seconds >= size)
      return `${Math.floor(seconds / size)}${label}`
  }
  return '刚刚'
}

function routeFromLocation(): InternalRoute | null {
  if (location.hash === '#biliyoutube/dynamic')
    return { kind: 'dynamic' }
  const channel = location.hash.match(/^#biliyoutube\/channel\/(\d+)$/)
  if (channel)
    return { kind: 'channel', mid: Number(channel[1]) }
  return null
}

function channelFromAnchor(anchor: HTMLAnchorElement, mid: number): ChannelPreview {
  const image = anchor.querySelector<HTMLImageElement>('img')
  const label = anchor.querySelector<HTMLElement>('span')?.textContent?.trim()
    || anchor.textContent?.trim()
    || `UID ${mid}`
  return {
    mid,
    name: label,
    face: image?.src ?? '',
  }
}

function dynamicSnippet(item: BiliDynamicItem): string {
  return item.video?.title || item.text || '发布了新动态'
}

export function installInternalNavigation(container: HTMLElement): InternalNavigationBridge {
  const overlay = element('section', 'byt-internal-overlay')
  overlay.hidden = true
  const popover = element('section', 'byt-top-popover')
  popover.hidden = true
  container.append(overlay, popover)

  const channelCache = new Map<number, ChannelPreview>()
  let renderToken = 0
  let popoverToken = 0

  function dynamicSidebarLink(): HTMLAnchorElement | null {
    return container.querySelector<HTMLAnchorElement>('.sidebar-item[href^="https://t.bilibili.com"]')
  }

  function setSidebarRoute(route: InternalRoute | null) {
    container.classList.toggle('byt-internal-route', Boolean(route))
    const dynamicLink = dynamicSidebarLink()
    dynamicLink?.classList.toggle('byt-bridge-active', route?.kind === 'dynamic')
  }

  function hidePopover() {
    popoverToken += 1
    popover.hidden = true
    popover.className = 'byt-top-popover'
    popover.replaceChildren()
  }

  function hideOverlay() {
    renderToken += 1
    overlay.hidden = true
    overlay.replaceChildren()
    overlay.onscroll = null
    setSidebarRoute(null)
  }

  function pushHash(hash: string) {
    const next = new URL(location.href)
    next.hash = hash
    window.history.pushState({ biliyoutubeInternal: hash }, '', `${next.pathname}${next.search}${next.hash}`)
  }

  function navigateBuiltin(hash: string) {
    hidePopover()
    hideOverlay()
    pushHash(hash)
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  }

  function makeAvatar(face: string, name: string, className = 'byt-dynamic-avatar'): HTMLElement {
    const holder = element('span', className)
    if (face) {
      const image = element('img')
      image.src = face
      image.alt = name
      image.loading = 'lazy'
      holder.append(image)
    }
    else {
      holder.textContent = name.slice(0, 1).toUpperCase()
    }
    return holder
  }

  function openChannel(preview: ChannelPreview, addHistory = true) {
    channelCache.set(preview.mid, preview)
    hidePopover()
    if (addHistory)
      pushHash(`#biliyoutube/channel/${preview.mid}`)
    void renderChannel(preview.mid)
  }

  function makeAuthorButton(item: BiliDynamicItem): HTMLButtonElement {
    const button = element('button', 'byt-dynamic-author')
    button.type = 'button'
    button.append(makeAvatar(item.author.face, item.author.name))
    const copy = element('span', 'byt-dynamic-author-copy')
    text(element('strong'), item.author.name)
    const name = text(element('strong'), item.author.name)
    const meta = text(element('small'), relativeTime(item.published))
    copy.append(name, meta)
    button.append(copy)
    button.addEventListener('click', () => {
      openChannel({ mid: item.author.mid, name: item.author.name, face: item.author.face })
    })
    return button
  }

  function renderDynamicCard(item: BiliDynamicItem, showAuthor = true): HTMLElement {
    const card = element('article', 'byt-dynamic-card')
    if (showAuthor)
      card.append(makeAuthorButton(item))

    if (item.text) {
      const body = text(element('p', 'byt-dynamic-text'), item.text)
      card.append(body)
    }

    if (item.video) {
      const video = element('a', 'byt-dynamic-video')
      video.href = item.video.url
      const cover = element('div', 'byt-dynamic-video-cover')
      if (item.video.cover) {
        const image = element('img')
        image.src = item.video.cover
        image.alt = item.video.title
        image.loading = 'lazy'
        cover.append(image)
      }
      if (item.video.durationText)
        cover.append(text(element('span', 'byt-dynamic-duration'), item.video.durationText))
      const copy = element('div', 'byt-dynamic-video-copy')
      copy.append(text(element('h3'), item.video.title))
      if (item.video.viewText)
        copy.append(text(element('p'), `${item.video.viewText} 次观看`))
      video.append(cover, copy)
      card.append(video)
    }
    else if (item.images.length) {
      const gallery = element('div', `byt-dynamic-gallery count-${Math.min(item.images.length, 3)}`)
      for (const source of item.images.slice(0, 6)) {
        const image = element('img')
        image.src = source
        image.alt = item.text || '动态图片'
        image.loading = 'lazy'
        gallery.append(image)
      }
      card.append(gallery)
    }

    return card
  }

  function makePageHeader(titleValue: string, subtitle = ''): HTMLElement {
    const header = element('header', 'byt-internal-header')
    const copy = element('div')
    copy.append(text(element('h1'), titleValue))
    if (subtitle)
      copy.append(text(element('p'), subtitle))
    header.append(copy)
    return header
  }

  function showOverlay(route: InternalRoute) {
    hidePopover()
    overlay.hidden = false
    setSidebarRoute(route)
  }

  async function renderDynamic(addHistory = false) {
    if (addHistory)
      pushHash('#biliyoutube/dynamic')
    const route: InternalRoute = { kind: 'dynamic' }
    showOverlay(route)
    const token = ++renderToken
    overlay.replaceChildren()
    overlay.scrollTop = 0

    const page = element('div', 'byt-internal-page byt-dynamic-page')
    page.append(makePageHeader('动态', '来自你关注的 UP 主'))
    const feed = element('div', 'byt-dynamic-feed')
    const status = text(element('div', 'byt-internal-status'), '正在加载动态…')
    page.append(feed, status)
    overlay.append(page)

    let offset = ''
    let hasMore = true
    let loading = false

    const loadMore = async () => {
      if (loading || !hasMore || token !== renderToken)
        return
      loading = true
      status.hidden = false
      status.textContent = offset ? '正在加载更多…' : '正在加载动态…'
      try {
        const result = await callApi<BiliDynamicPage>({
          type: 'dynamicFeed',
          filter: 'all',
          offset,
        })
        if (token !== renderToken)
          return
        for (const item of result.items)
          feed.append(renderDynamicCard(item))
        offset = result.offset
        hasMore = result.hasMore && result.items.length > 0
        if (!feed.childElementCount)
          status.textContent = '暂时没有动态。'
        else if (!hasMore)
          status.hidden = true
      }
      catch (error) {
        if (token !== renderToken)
          return
        status.textContent = error instanceof Error ? `动态加载失败：${error.message}` : '动态加载失败。'
        hasMore = false
      }
      finally {
        loading = false
      }
    }

    overlay.onscroll = () => {
      if (overlay.scrollHeight - overlay.scrollTop - overlay.clientHeight < 800)
        void loadMore()
    }
    await loadMore()
  }

  async function renderChannel(mid: number) {
    const route: InternalRoute = { kind: 'channel', mid }
    showOverlay(route)
    const token = ++renderToken
    overlay.replaceChildren()
    overlay.scrollTop = 0

    const preview = channelCache.get(mid) ?? { mid, name: `UID ${mid}`, face: '' }
    const page = element('div', 'byt-internal-page byt-channel-page')
    const hero = element('header', 'byt-channel-hero')
    const avatar = makeAvatar(preview.face, preview.name, 'byt-channel-avatar')
    const heroCopy = element('div', 'byt-channel-copy')
    const channelName = text(element('h1'), preview.name)
    const channelMeta = text(element('p'), `UID ${mid}`)
    heroCopy.append(channelName, channelMeta)
    hero.append(avatar, heroCopy)

    const tabs = element('div', 'byt-channel-tabs')
    const videoTab = text(element('button'), '视频')
    const dynamicTab = text(element('button'), '动态')
    videoTab.type = 'button'
    dynamicTab.type = 'button'
    tabs.append(videoTab, dynamicTab)

    const feed = element('div', 'byt-dynamic-feed byt-channel-feed')
    const status = text(element('div', 'byt-internal-status'), '正在加载频道内容…')
    page.append(hero, tabs, feed, status)
    overlay.append(page)

    let filter: BiliDynamicFilter = 'video'
    let offset = ''
    let hasMore = true
    let loading = false
    let generation = 0

    const syncTabs = () => {
      videoTab.classList.toggle('active', filter === 'video')
      dynamicTab.classList.toggle('active', filter === 'all')
    }

    const loadMore = async (reset = false) => {
      if (loading || token !== renderToken)
        return
      if (reset) {
        generation += 1
        offset = ''
        hasMore = true
        feed.replaceChildren()
        overlay.scrollTop = 0
      }
      if (!hasMore)
        return
      const currentGeneration = generation
      loading = true
      status.hidden = false
      status.textContent = offset ? '正在加载更多…' : '正在加载频道内容…'
      try {
        const result = await callApi<BiliDynamicPage>({
          type: 'dynamicFeed',
          mid,
          filter,
          offset,
        })
        if (token !== renderToken || currentGeneration !== generation)
          return
        const first = result.items[0]
        if (first) {
          const updated = { mid, name: first.author.name, face: first.author.face }
          channelCache.set(mid, updated)
          channelName.textContent = updated.name
          channelMeta.textContent = `UID ${mid}`
          if (updated.face && avatar.querySelector('img') === null) {
            const image = element('img')
            image.src = updated.face
            image.alt = updated.name
            avatar.replaceChildren(image)
          }
        }
        for (const item of result.items)
          feed.append(renderDynamicCard(item, filter !== 'video'))
        offset = result.offset
        hasMore = result.hasMore && result.items.length > 0
        if (!feed.childElementCount)
          status.textContent = filter === 'video' ? '这个频道暂时没有可显示的视频。' : '这个频道暂时没有动态。'
        else if (!hasMore)
          status.hidden = true
      }
      catch (error) {
        if (token !== renderToken || currentGeneration !== generation)
          return
        status.textContent = error instanceof Error ? `频道加载失败：${error.message}` : '频道加载失败。'
        hasMore = false
      }
      finally {
        loading = false
      }
    }

    videoTab.addEventListener('click', () => {
      if (filter === 'video')
        return
      filter = 'video'
      syncTabs()
      void loadMore(true)
    })
    dynamicTab.addEventListener('click', () => {
      if (filter === 'all')
        return
      filter = 'all'
      syncTabs()
      void loadMore(true)
    })
    syncTabs()

    overlay.onscroll = () => {
      if (overlay.scrollHeight - overlay.scrollTop - overlay.clientHeight < 800)
        void loadMore()
    }
    await loadMore(true)
  }

  async function showNotifications() {
    const token = ++popoverToken
    popover.hidden = false
    popover.className = 'byt-top-popover byt-notification-popover'
    popover.replaceChildren()

    const header = element('header', 'byt-popover-header')
    header.append(text(element('h2'), '通知'), text(element('span'), '最近的订阅更新'))
    const list = element('div', 'byt-notification-list')
    const status = text(element('div', 'byt-popover-status'), '正在加载…')
    popover.append(header, list, status)

    try {
      const result = await callApi<BiliDynamicPage>({ type: 'dynamicFeed', filter: 'all' })
      if (token !== popoverToken)
        return
      for (const item of result.items.slice(0, 8)) {
        const button = element('button', 'byt-notification-item')
        button.type = 'button'
        button.append(makeAvatar(item.author.face, item.author.name, 'byt-notification-avatar'))
        const copy = element('span', 'byt-notification-copy')
        copy.append(
          text(element('strong'), item.author.name),
          text(element('span'), dynamicSnippet(item)),
          text(element('small'), relativeTime(item.published)),
        )
        button.append(copy)
        button.addEventListener('click', () => {
          hidePopover()
          if (item.video)
            location.href = item.video.url
          else
            void renderDynamic(true)
        })
        list.append(button)
      }
      status.hidden = Boolean(list.childElementCount)
      if (!list.childElementCount)
        status.textContent = '暂时没有新的订阅更新。'
    }
    catch (error) {
      if (token !== popoverToken)
        return
      status.textContent = error instanceof Error ? `通知加载失败：${error.message}` : '通知加载失败。'
    }
  }

  async function showAccountMenu() {
    const token = ++popoverToken
    popover.hidden = false
    popover.className = 'byt-top-popover byt-account-popover'
    popover.replaceChildren(text(element('div', 'byt-popover-status'), '正在加载账号…'))

    try {
      const user = await callApi<BiliUser | null>({ type: 'user' })
      if (token !== popoverToken)
        return
      if (!user) {
        const login = element('a', 'byt-account-login')
        login.href = 'https://passport.bilibili.com/login'
        login.textContent = '登录 Bilibili'
        popover.replaceChildren(login)
        return
      }

      const header = element('header', 'byt-account-header')
      header.append(makeAvatar(user.face, user.name, 'byt-account-avatar'))
      const copy = element('div')
      copy.append(text(element('strong'), user.name), text(element('span'), `UID ${user.mid}`))
      header.append(copy)

      const menu = element('div', 'byt-account-menu')
      const addButton = (label: string, action: () => void) => {
        const button = text(element('button'), label)
        button.type = 'button'
        button.addEventListener('click', action)
        menu.append(button)
      }
      addButton('你的频道', () => openChannel({ mid: user.mid, name: user.name, face: user.face }))
      addButton('订阅动态', () => {
        hidePopover()
        void renderDynamic(true)
      })
      addButton('观看记录', () => navigateBuiltin('#biliyoutube/history'))
      addButton('播放列表', () => navigateBuiltin('#biliyoutube/favorites'))
      addButton('稍后再看', () => navigateBuiltin('#biliyoutube/watch-later'))
      popover.replaceChildren(header, menu)
    }
    catch (error) {
      if (token !== popoverToken)
        return
      popover.replaceChildren(text(
        element('div', 'byt-popover-status'),
        error instanceof Error ? `账号加载失败：${error.message}` : '账号加载失败。',
      ))
    }
  }

  function interceptAnchor(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
    const href = normalizeHref(anchor.href)

    if (anchor.classList.contains('avatar-link')) {
      event.preventDefault()
      event.stopPropagation()
      if (!popover.hidden && popover.classList.contains('byt-account-popover'))
        hidePopover()
      else
        void showAccountMenu()
      return true
    }

    if (href.startsWith('https://message.bilibili.com/')) {
      event.preventDefault()
      event.stopPropagation()
      if (!popover.hidden && popover.classList.contains('byt-notification-popover'))
        hidePopover()
      else
        void showNotifications()
      return true
    }

    if (href === 'https://t.bilibili.com/' || href.startsWith('https://t.bilibili.com/?')) {
      event.preventDefault()
      event.stopPropagation()
      void renderDynamic(true)
      return true
    }

    const space = href.match(/^https:\/\/space\.bilibili\.com\/(\d+)/)
    if (space) {
      const mid = Number(space[1])
      if (!mid)
        return false
      event.preventDefault()
      event.stopPropagation()
      openChannel(channelFromAnchor(anchor, mid))
      return true
    }

    return false
  }

  function onContainerClick(rawEvent: Event) {
    if (!(rawEvent instanceof MouseEvent) || rawEvent.button !== 0)
      return
    const path = rawEvent.composedPath()
    if (!popover.hidden && !path.includes(popover)) {
      const toggle = path.find(node => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined
      const href = toggle ? normalizeHref(toggle.href) : ''
      if (!toggle?.classList.contains('avatar-link') && !href.startsWith('https://message.bilibili.com/'))
        hidePopover()
    }

    const button = path.find(node => node instanceof HTMLButtonElement) as HTMLButtonElement | undefined
    if (button?.classList.contains('brand-button') || button?.classList.contains('sidebar-button'))
      hideOverlay()

    const anchor = path.find(node => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined
    if (anchor)
      interceptAnchor(anchor, rawEvent)
  }

  function syncFromLocation() {
    hidePopover()
    const route = routeFromLocation()
    if (!route) {
      hideOverlay()
      return
    }
    if (route.kind === 'dynamic')
      void renderDynamic(false)
    else
      void renderChannel(route.mid)
  }

  container.addEventListener('click', onContainerClick, true)
  window.addEventListener('popstate', syncFromLocation)
  syncFromLocation()

  return {
    destroy() {
      renderToken += 1
      popoverToken += 1
      container.removeEventListener('click', onContainerClick, true)
      window.removeEventListener('popstate', syncFromLocation)
      overlay.remove()
      popover.remove()
      container.classList.remove('byt-internal-route')
      dynamicSidebarLink()?.classList.remove('byt-bridge-active')
    },
  }
}
