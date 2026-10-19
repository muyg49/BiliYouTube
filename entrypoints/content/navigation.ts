import { callApi } from '../../lib/api'
import type {
  BiliChannelVideo,
  BiliChannelVideoPage,
  BiliDynamicItem,
  BiliDynamicPage,
  BiliFollowing,
  BiliUser,
} from '../../types/bilibili'

type InternalRoute =
  | { kind: 'subscriptions' }
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

function text<T extends HTMLElement>(node: T, value: string): T {
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

function formatViews(value: number): string {
  if (value >= 100_000_000)
    return `${(value / 100_000_000).toFixed(1)}亿次观看`
  if (value >= 10_000)
    return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}万次观看`
  return `${value}次观看`
}

function routeFromLocation(): InternalRoute | null {
  if (location.hash === '#biliyoutube/subscriptions')
    return { kind: 'subscriptions' }
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

  function subscriptionsHeading(): HTMLAnchorElement | null {
    return container.querySelector<HTMLAnchorElement>('.subscriptions .section-heading-link')
  }

  function setSidebarRoute(route: InternalRoute | null) {
    container.classList.toggle('byt-internal-route', Boolean(route))
    dynamicSidebarLink()?.classList.toggle('byt-bridge-active', route?.kind === 'dynamic')
    subscriptionsHeading()?.classList.toggle('byt-bridge-active', route?.kind === 'subscriptions')

    for (const anchor of container.querySelectorAll<HTMLAnchorElement>('.subscriptions .channel-item')) {
      const match = normalizeHref(anchor.href).match(/^https:\/\/space\.bilibili\.com\/(\d+)/)
      anchor.classList.toggle('byt-bridge-active', route?.kind === 'channel' && Number(match?.[1]) === route.mid)
    }
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
    copy.append(
      text(element('strong'), item.author.name),
      text(element('small'), relativeTime(item.published)),
    )
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

    if (item.text)
      card.append(text(element('p', 'byt-dynamic-text'), item.text))

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

  function renderSubscriptionVideo(item: BiliDynamicItem): HTMLElement | null {
    const video = item.video
    if (!video)
      return null

    const card = element('article', 'byt-subscription-video-card')
    const thumb = element('a', 'byt-subscription-thumb')
    thumb.href = video.url
    if (video.cover) {
      const image = element('img')
      image.src = video.cover
      image.alt = video.title
      image.loading = 'lazy'
      thumb.append(image)
    }
    if (video.durationText)
      thumb.append(text(element('span', 'byt-dynamic-duration'), video.durationText))

    const meta = element('div', 'byt-subscription-meta')
    const author = element('button', 'byt-subscription-author')
    author.type = 'button'
    author.title = item.author.name
    author.append(makeAvatar(item.author.face, item.author.name, 'byt-subscription-avatar'))
    author.addEventListener('click', () => {
      openChannel({ mid: item.author.mid, name: item.author.name, face: item.author.face })
    })

    const copy = element('div', 'byt-subscription-copy')
    const title = text(element('a', 'byt-subscription-title'), video.title)
    title.href = video.url
    const channel = text(element('button', 'byt-subscription-channel'), item.author.name)
    channel.type = 'button'
    channel.addEventListener('click', () => {
      openChannel({ mid: item.author.mid, name: item.author.name, face: item.author.face })
    })
    const stats = element('div', 'byt-subscription-stats')
    const pieces = []
    if (video.viewText)
      pieces.push(`${video.viewText} 次观看`)
    if (item.published)
      pieces.push(relativeTime(item.published))
    stats.textContent = pieces.join(' · ')
    copy.append(title, channel, stats)
    meta.append(author, copy)
    card.append(thumb, meta)
    return card
  }

  function renderChannelVideo(item: BiliChannelVideo): HTMLElement {
    const card = element('article', 'byt-channel-video-card')
    const thumb = element('a', 'byt-channel-video-thumb')
    thumb.href = item.url
    const image = element('img')
    image.src = item.cover
    image.alt = item.title
    image.loading = 'lazy'
    thumb.append(image)
    if (item.durationText)
      thumb.append(text(element('span', 'byt-dynamic-duration'), item.durationText))

    const copy = element('div', 'byt-channel-video-copy')
    const title = text(element('a', 'byt-channel-video-title'), item.title)
    title.href = item.url
    const meta = text(
      element('div', 'byt-channel-video-meta'),
      [formatViews(item.view), relativeTime(item.published)].filter(Boolean).join(' · '),
    )
    copy.append(title, meta)
    card.append(thumb, copy)
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

  async function renderSubscriptions(addHistory = false) {
    if (addHistory)
      pushHash('#biliyoutube/subscriptions')
    const route: InternalRoute = { kind: 'subscriptions' }
    showOverlay(route)
    const token = ++renderToken
    overlay.replaceChildren()
    overlay.scrollTop = 0

    const page = element('div', 'byt-internal-page byt-subscriptions-page')
    const toolbar = element('header', 'byt-subscriptions-toolbar')
    toolbar.append(text(element('h1'), '最新'))
    const allButton = text(element('button', 'byt-all-subscriptions-button'), '所有订阅')
    allButton.type = 'button'
    toolbar.append(allButton)
    const allPanel = element('div', 'byt-all-subscriptions-panel')
    allPanel.hidden = true
    const grid = element('div', 'byt-subscriptions-video-grid')
    const status = text(element('div', 'byt-internal-status'), '正在加载订阅内容…')
    page.append(toolbar, allPanel, grid, status)
    overlay.append(page)

    let offset = ''
    let hasMore = true
    let loading = false
    let allLoaded = false

    allButton.addEventListener('click', async () => {
      if (!allPanel.hidden) {
        allPanel.hidden = true
        allButton.classList.remove('active')
        return
      }
      allPanel.hidden = false
      allButton.classList.add('active')
      if (allLoaded)
        return
      allPanel.replaceChildren(text(element('div', 'byt-internal-status'), '正在加载全部订阅…'))
      try {
        const user = await callApi<BiliUser | null>({ type: 'user' })
        if (!user || token !== renderToken)
          return
        const following = await callApi<BiliFollowing[]>({ type: 'following', mid: user.mid, page: 1 })
        if (token !== renderToken)
          return
        const list = element('div', 'byt-all-subscriptions-grid')
        for (const channel of following) {
          const button = element('button', 'byt-all-subscription')
          button.type = 'button'
          button.append(makeAvatar(channel.face, channel.uname, 'byt-all-subscription-avatar'))
          button.append(text(element('span'), channel.uname))
          button.addEventListener('click', () => {
            openChannel({ mid: channel.mid, name: channel.uname, face: channel.face })
          })
          list.append(button)
        }
        allPanel.replaceChildren(list)
        allLoaded = true
      }
      catch (error) {
        if (token === renderToken) {
          allPanel.replaceChildren(text(
            element('div', 'byt-internal-status'),
            error instanceof Error ? `订阅列表加载失败：${error.message}` : '订阅列表加载失败。',
          ))
        }
      }
    })

    const loadMore = async () => {
      if (loading || !hasMore || token !== renderToken)
        return
      loading = true
      status.hidden = false
      status.textContent = offset ? '正在加载更多…' : '正在加载订阅内容…'
      try {
        const result = await callApi<BiliDynamicPage>({
          type: 'dynamicFeed',
          filter: 'video',
          offset,
        })
        if (token !== renderToken)
          return
        let appended = 0
        for (const item of result.items) {
          const card = renderSubscriptionVideo(item)
          if (card) {
            grid.append(card)
            appended += 1
          }
        }
        offset = result.offset
        hasMore = result.hasMore && result.items.length > 0
        if (!grid.childElementCount && !hasMore)
          status.textContent = '暂时没有新的订阅视频。'
        else if (!hasMore)
          status.hidden = true
        else if (!appended)
          void loadMore()
      }
      catch (error) {
        if (token !== renderToken)
          return
        status.textContent = error instanceof Error ? `订阅内容加载失败：${error.message}` : '订阅内容加载失败。'
        hasMore = false
      }
      finally {
        loading = false
      }
    }

    overlay.onscroll = () => {
      if (overlay.scrollHeight - overlay.scrollTop - overlay.clientHeight < 900)
        void loadMore()
    }
    await loadMore()
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

    const videoGrid = element('div', 'byt-channel-video-grid')
    const dynamicFeed = element('div', 'byt-dynamic-feed byt-channel-dynamic-feed')
    dynamicFeed.hidden = true
    const status = text(element('div', 'byt-internal-status'), '正在加载频道视频…')
    page.append(hero, tabs, videoGrid, dynamicFeed, status)
    overlay.append(page)

    let mode: 'videos' | 'dynamic' = 'videos'
    let videoPage = 0
    let videoHasMore = true
    let dynamicOffset = ''
    let dynamicHasMore = true
    let loading = false
    let generation = 0

    const syncTabs = () => {
      videoTab.classList.toggle('active', mode === 'videos')
      dynamicTab.classList.toggle('active', mode === 'dynamic')
      videoGrid.hidden = mode !== 'videos'
      dynamicFeed.hidden = mode !== 'dynamic'
    }

    const updatePreviewFromDynamic = (item: BiliDynamicItem | undefined) => {
      if (!item)
        return
      const updated = { mid, name: item.author.name, face: item.author.face }
      channelCache.set(mid, updated)
      channelName.textContent = updated.name
      if (updated.face && avatar.querySelector('img') === null) {
        const image = element('img')
        image.src = updated.face
        image.alt = updated.name
        avatar.replaceChildren(image)
      }
    }

    const loadVideos = async (reset = false) => {
      if (loading || token !== renderToken)
        return
      if (reset) {
        generation += 1
        videoPage = 0
        videoHasMore = true
        videoGrid.replaceChildren()
        overlay.scrollTop = 0
      }
      if (!videoHasMore)
        return
      const currentGeneration = generation
      loading = true
      status.hidden = false
      status.textContent = videoPage ? '正在加载更多视频…' : '正在加载频道视频…'
      try {
        const nextPage = videoPage + 1
        const result = await callApi<BiliChannelVideoPage>({ type: 'channelVideos', mid, page: nextPage })
        if (token !== renderToken || currentGeneration !== generation || mode !== 'videos')
          return
        for (const item of result.items)
          videoGrid.append(renderChannelVideo(item))
        videoPage = result.page
        videoHasMore = result.hasMore
        channelMeta.textContent = result.total ? `${result.total} 个视频 · UID ${mid}` : `UID ${mid}`
        if (!videoGrid.childElementCount)
          status.textContent = '这个频道暂时没有可显示的视频。'
        else if (!videoHasMore)
          status.hidden = true
      }
      catch (error) {
        if (token !== renderToken || currentGeneration !== generation)
          return
        status.textContent = error instanceof Error ? `频道视频加载失败：${error.message}` : '频道视频加载失败。'
        videoHasMore = false
      }
      finally {
        loading = false
      }
    }

    const loadDynamic = async (reset = false) => {
      if (loading || token !== renderToken)
        return
      if (reset) {
        generation += 1
        dynamicOffset = ''
        dynamicHasMore = true
        dynamicFeed.replaceChildren()
        overlay.scrollTop = 0
      }
      if (!dynamicHasMore)
        return
      const currentGeneration = generation
      loading = true
      status.hidden = false
      status.textContent = dynamicOffset ? '正在加载更多动态…' : '正在加载频道动态…'
      try {
        const result = await callApi<BiliDynamicPage>({
          type: 'dynamicFeed',
          mid,
          filter: 'all',
          offset: dynamicOffset,
        })
        if (token !== renderToken || currentGeneration !== generation || mode !== 'dynamic')
          return
        updatePreviewFromDynamic(result.items[0])
        for (const item of result.items)
          dynamicFeed.append(renderDynamicCard(item, false))
        dynamicOffset = result.offset
        dynamicHasMore = result.hasMore && result.items.length > 0
        if (!dynamicFeed.childElementCount)
          status.textContent = '这个频道暂时没有动态。'
        else if (!dynamicHasMore)
          status.hidden = true
      }
      catch (error) {
        if (token !== renderToken || currentGeneration !== generation)
          return
        status.textContent = error instanceof Error ? `频道动态加载失败：${error.message}` : '频道动态加载失败。'
        dynamicHasMore = false
      }
      finally {
        loading = false
      }
    }

    videoTab.addEventListener('click', () => {
      if (mode === 'videos')
        return
      mode = 'videos'
      syncTabs()
      status.hidden = videoGrid.childElementCount > 0
      if (!videoGrid.childElementCount)
        void loadVideos(true)
    })
    dynamicTab.addEventListener('click', () => {
      if (mode === 'dynamic')
        return
      mode = 'dynamic'
      syncTabs()
      status.hidden = dynamicFeed.childElementCount > 0
      if (!dynamicFeed.childElementCount)
        void loadDynamic(true)
    })
    syncTabs()

    overlay.onscroll = () => {
      if (overlay.scrollHeight - overlay.scrollTop - overlay.clientHeight >= 900)
        return
      if (mode === 'videos')
        void loadVideos()
      else
        void loadDynamic()
    }
    await loadVideos(true)
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
      addButton('订阅内容', () => {
        hidePopover()
        void renderSubscriptions(true)
      })
      addButton('动态', () => {
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

    if (anchor.matches('.subscriptions .section-heading-link')) {
      event.preventDefault()
      event.stopPropagation()
      void renderSubscriptions(true)
      return true
    }

    if (href.includes('#biliyoutube/subscriptions')) {
      event.preventDefault()
      event.stopPropagation()
      void renderSubscriptions(true)
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
    if (route.kind === 'subscriptions')
      void renderSubscriptions(false)
    else if (route.kind === 'dynamic')
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
      subscriptionsHeading()?.classList.remove('byt-bridge-active')
      container.querySelectorAll('.subscriptions .channel-item.byt-bridge-active')
        .forEach(node => node.classList.remove('byt-bridge-active'))
    },
  }
}
