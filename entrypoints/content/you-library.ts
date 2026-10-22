import { callApi } from '../../lib/api'
import type {
  BiliFavoriteFolder,
  BiliFavoriteItem,
  BiliFavoritePage,
  BiliHistoryPage,
  BiliUser,
  BiliWatchLaterPage,
} from '../../types/bilibili'

export interface YouLibraryBridge {
  destroy: () => void
}

type YouRoute = 'you' | 'saved' | null

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

function routeFromLocation(): YouRoute {
  if (location.hash === '#biliyoutube/you')
    return 'you'
  if (location.hash === '#biliyoutube/saved')
    return 'saved'
  return null
}

function pushHash(hash: string) {
  const next = new URL(location.href)
  next.hash = hash
  window.history.pushState({ biliyoutubeYouLibrary: hash }, '', `${next.pathname}${next.search}${next.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
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

function makeSavedCard(item: BiliFavoriteItem): HTMLElement {
  const card = element('article', 'byt-saved-card')
  const thumb = element('a', 'byt-saved-thumb')
  thumb.href = item.url
  if (item.cover) {
    const image = element('img')
    image.src = item.cover
    image.alt = item.title
    image.loading = 'lazy'
    thumb.append(image)
  }
  if (item.duration)
    thumb.append(text(element('span', 'byt-saved-duration'), formatDuration(item.duration)))

  const title = text(element('a', 'byt-saved-title'), item.title)
  title.href = item.url
  const meta = element('div', 'byt-saved-meta')
  if (item.authorMid) {
    const author = text(element('a'), item.authorName)
    author.href = `https://space.bilibili.com/${item.authorMid}`
    meta.append(author)
  }
  else if (item.authorName) {
    meta.append(text(element('span'), item.authorName))
  }
  if (item.favoriteAt)
    meta.append(text(element('span'), ` · ${relativeTime(item.favoriteAt)}收藏`))

  card.append(thumb, title, meta)
  return card
}

export function installYouLibrary(container: HTMLElement): YouLibraryBridge {
  const overlay = element('section', 'byt-you-overlay')
  overlay.hidden = true
  container.append(overlay)

  let renderToken = 0
  let savedButton: HTMLButtonElement | null = null
  let heading: HTMLElement | null = null
  let observer: MutationObserver | null = null

  function sidebarSection(): HTMLElement | null {
    return Array.from(container.querySelectorAll<HTMLElement>('.sidebar-section'))
      .find(section => section.querySelector('.static-heading h2')?.textContent?.trim() === '你') ?? null
  }

  function makeSavedButton(): HTMLButtonElement {
    const button = element('button', 'sidebar-item sidebar-button byt-saved-sidebar')
    button.type = 'button'
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5 4.8 13.7A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 7.2 7.7Z" /></svg><span>收藏</span>'
    button.addEventListener('click', () => pushHash('#biliyoutube/saved'))
    return button
  }

  function ensureSidebarHooks() {
    const section = sidebarSection()
    if (!section)
      return

    const currentHeading = section.querySelector<HTMLElement>('.section-heading-link.static-heading')
    if (currentHeading && currentHeading !== heading) {
      heading = currentHeading
      heading.classList.add('byt-you-heading')
      heading.setAttribute('role', 'button')
      heading.setAttribute('tabindex', '0')
      heading.setAttribute('aria-label', '打开你的内容')
      heading.addEventListener('click', onHeadingClick)
      heading.addEventListener('keydown', onHeadingKeydown)
    }

    if (!section.querySelector('.byt-saved-sidebar')) {
      savedButton = makeSavedButton()
      const buttons = section.querySelectorAll<HTMLElement>('.sidebar-item')
      const playlist = Array.from(buttons).find(button => button.textContent?.trim() === '播放列表')
      if (playlist?.nextSibling)
        section.insertBefore(savedButton, playlist.nextSibling)
      else if (playlist)
        playlist.after(savedButton)
      else
        section.append(savedButton)
    }
    else {
      savedButton = section.querySelector<HTMLButtonElement>('.byt-saved-sidebar')
    }
  }

  function onHeadingClick(event: Event) {
    event.preventDefault()
    pushHash('#biliyoutube/you')
  }

  function onHeadingKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ')
      return
    event.preventDefault()
    pushHash('#biliyoutube/you')
  }

  function setSidebarRoute(route: YouRoute) {
    const active = Boolean(route)
    container.classList.toggle('byt-you-route', active)
    heading?.classList.toggle('byt-you-active', route === 'you')
    savedButton?.classList.toggle('byt-you-active', route === 'saved')
  }

  function hideOverlay() {
    renderToken += 1
    overlay.hidden = true
    overlay.replaceChildren()
    overlay.onscroll = null
    setSidebarRoute(null)
  }

  function makeHeader(title: string, subtitle: string): HTMLElement {
    const header = element('header', 'byt-you-page-header')
    header.append(text(element('h1'), title), text(element('p'), subtitle))
    return header
  }

  function makeShortcut(label: string, description: string, hash: string): HTMLButtonElement {
    const button = element('button', 'byt-you-shortcut')
    button.type = 'button'
    button.append(text(element('strong'), label), text(element('span'), description))
    button.addEventListener('click', () => pushHash(hash))
    return button
  }

  async function renderYou() {
    const token = ++renderToken
    setSidebarRoute('you')
    overlay.hidden = false
    overlay.scrollTop = 0
    overlay.replaceChildren()

    const page = element('div', 'byt-you-page')
    const status = text(element('div', 'byt-you-status'), '正在加载…')
    page.append(makeHeader('你', '观看记录、播放列表、收藏和稍后再看'), status)
    overlay.append(page)

    try {
      const user = await callApi<BiliUser | null>({ type: 'user' })
      if (token !== renderToken)
        return
      if (!user) {
        status.textContent = '登录 Bilibili 后即可查看你的内容。'
        const login = text(element('a', 'byt-you-login'), '登录')
        login.href = 'https://passport.bilibili.com/login'
        page.append(login)
        return
      }

      status.remove()
      const profile = element('section', 'byt-you-profile')
      if (user.face) {
        const avatar = element('img')
        avatar.src = user.face
        avatar.alt = user.name
        profile.append(avatar)
      }
      const profileCopy = element('div')
      profileCopy.append(text(element('h2'), user.name), text(element('p'), `UID ${user.mid}`))
      profile.append(profileCopy)
      page.append(profile)

      const shortcuts = element('section', 'byt-you-shortcuts')
      shortcuts.append(
        makeShortcut('历史记录', '继续你最近看过的内容', '#biliyoutube/history'),
        makeShortcut('播放列表', '浏览你的 Bilibili 收藏夹', '#biliyoutube/favorites'),
        makeShortcut('收藏', '直接查看收藏夹里的视频', '#biliyoutube/saved'),
        makeShortcut('稍后再看', '查看留到之后的视频', '#biliyoutube/watch-later'),
      )
      page.append(shortcuts)

      const previews = element('div', 'byt-you-preview-stack')
      page.append(previews)

      const [historyResult, foldersResult, laterResult] = await Promise.allSettled([
        callApi<BiliHistoryPage>({ type: 'history', filter: 'archive', cursor: null }),
        callApi<BiliFavoriteFolder[]>({ type: 'favoriteFolders', mid: user.mid }),
        callApi<BiliWatchLaterPage>({ type: 'watchLater' }),
      ])
      if (token !== renderToken)
        return

      if (historyResult.status === 'fulfilled' && historyResult.value.items.length) {
        const section = element('section', 'byt-you-preview-section')
        const rowHeader = element('div', 'byt-you-row-header')
        rowHeader.append(text(element('h2'), '最近观看'))
        const more = text(element('button'), '查看全部')
        more.type = 'button'
        more.addEventListener('click', () => pushHash('#biliyoutube/history'))
        rowHeader.append(more)
        const grid = element('div', 'byt-you-mini-grid')
        for (const item of historyResult.value.items.slice(0, 4)) {
          const card = element('article', 'byt-you-mini-card')
          const thumb = element('a', 'byt-you-mini-thumb')
          thumb.href = item.url
          if (item.cover) {
            const image = element('img')
            image.src = item.cover
            image.alt = item.title
            image.loading = 'lazy'
            thumb.append(image)
          }
          card.append(thumb, text(element('a', 'byt-you-mini-title'), item.title))
          const title = card.querySelector<HTMLAnchorElement>('.byt-you-mini-title')
          if (title)
            title.href = item.url
          grid.append(card)
        }
        section.append(rowHeader, grid)
        previews.append(section)
      }

      if (foldersResult.status === 'fulfilled' && foldersResult.value.length) {
        const section = element('section', 'byt-you-preview-section')
        const rowHeader = element('div', 'byt-you-row-header')
        rowHeader.append(text(element('h2'), '收藏'))
        const more = text(element('button'), '查看全部')
        more.type = 'button'
        more.addEventListener('click', () => pushHash('#biliyoutube/saved'))
        rowHeader.append(more)
        const folder = foldersResult.value[0]!
        const favoritePage = await callApi<BiliFavoritePage>({ type: 'favoritePage', mediaId: folder.id, page: 1, sort: 'mtime' })
        if (token !== renderToken)
          return
        const grid = element('div', 'byt-saved-grid compact')
        for (const item of favoritePage.items.slice(0, 4))
          grid.append(makeSavedCard(item))
        section.append(rowHeader, grid)
        previews.append(section)
      }

      if (laterResult.status === 'fulfilled') {
        const count = laterResult.value.count
        const shortcut = Array.from(shortcuts.querySelectorAll<HTMLElement>('.byt-you-shortcut strong'))
          .find(node => node.textContent === '稍后再看')
          ?.parentElement?.querySelector('span')
        if (shortcut)
          shortcut.textContent = count ? `${count} 个视频等待观看` : '暂时没有视频'
      }
    }
    catch (error) {
      if (token !== renderToken)
        return
      status.textContent = error instanceof Error ? `加载失败：${error.message}` : '加载失败。'
    }
  }

  async function renderSaved() {
    const token = ++renderToken
    setSidebarRoute('saved')
    overlay.hidden = false
    overlay.scrollTop = 0
    overlay.replaceChildren()

    const page = element('div', 'byt-you-page')
    const status = text(element('div', 'byt-you-status'), '正在加载收藏…')
    page.append(makeHeader('收藏', '直接浏览 Bilibili 收藏夹中的视频'), status)
    overlay.append(page)

    try {
      const user = await callApi<BiliUser | null>({ type: 'user' })
      if (token !== renderToken)
        return
      if (!user) {
        status.textContent = '登录 Bilibili 后即可查看收藏。'
        const login = text(element('a', 'byt-you-login'), '登录')
        login.href = 'https://passport.bilibili.com/login'
        page.append(login)
        return
      }

      const folders = await callApi<BiliFavoriteFolder[]>({ type: 'favoriteFolders', mid: user.mid })
      if (token !== renderToken)
        return
      if (!folders.length) {
        status.textContent = '还没有收藏夹。'
        return
      }

      status.remove()
      const tabs = element('div', 'byt-saved-folder-tabs')
      const grid = element('div', 'byt-saved-grid')
      const footer = element('div', 'byt-saved-footer')
      page.append(tabs, grid, footer)

      let selected = folders[0]!
      let currentPage = 1
      let hasMore = false
      let loading = false

      const syncTabs = () => {
        for (const button of tabs.querySelectorAll<HTMLButtonElement>('button'))
          button.classList.toggle('active', Number(button.dataset.folderId) === selected.id)
      }

      const loadPage = async (reset: boolean) => {
        if (loading)
          return
        loading = true
        if (reset) {
          currentPage = 1
          grid.replaceChildren(text(element('div', 'byt-you-status'), '正在加载…'))
          footer.replaceChildren()
        }
        try {
          const result = await callApi<BiliFavoritePage>({
            type: 'favoritePage',
            mediaId: selected.id,
            page: reset ? 1 : currentPage + 1,
            sort: 'mtime',
          })
          if (token !== renderToken)
            return
          if (reset)
            grid.replaceChildren()
          for (const item of result.items)
            grid.append(makeSavedCard(item))
          currentPage = result.page
          hasMore = result.hasMore
          footer.replaceChildren()
          if (!grid.childElementCount)
            grid.append(text(element('div', 'byt-you-status'), '这个收藏夹是空的。'))
          if (hasMore) {
            const more = text(element('button', 'byt-saved-more'), '加载更多')
            more.type = 'button'
            more.addEventListener('click', () => void loadPage(false))
            footer.append(more)
          }
        }
        catch (error) {
          if (token !== renderToken)
            return
          footer.replaceChildren(text(
            element('div', 'byt-you-status error'),
            error instanceof Error ? `加载失败：${error.message}` : '加载失败。',
          ))
        }
        finally {
          loading = false
        }
      }

      for (const folder of folders) {
        const button = text(element('button'), folder.title)
        button.type = 'button'
        button.dataset.folderId = String(folder.id)
        button.title = `${folder.mediaCount} 个视频`
        button.addEventListener('click', () => {
          if (selected.id === folder.id)
            return
          selected = folder
          syncTabs()
          void loadPage(true)
        })
        tabs.append(button)
      }
      syncTabs()
      await loadPage(true)
    }
    catch (error) {
      if (token !== renderToken)
        return
      status.textContent = error instanceof Error ? `收藏加载失败：${error.message}` : '收藏加载失败。'
    }
  }

  function syncFromLocation() {
    ensureSidebarHooks()
    const route = routeFromLocation()
    if (route === 'you')
      void renderYou()
    else if (route === 'saved')
      void renderSaved()
    else
      hideOverlay()
  }

  ensureSidebarHooks()
  observer = new MutationObserver(() => ensureSidebarHooks())
  observer.observe(container, { childList: true, subtree: true })
  window.addEventListener('popstate', syncFromLocation)
  syncFromLocation()

  return {
    destroy() {
      renderToken += 1
      observer?.disconnect()
      window.removeEventListener('popstate', syncFromLocation)
      heading?.removeEventListener('click', onHeadingClick)
      heading?.removeEventListener('keydown', onHeadingKeydown)
      savedButton?.remove()
      heading?.classList.remove('byt-you-heading', 'byt-you-active')
      heading?.removeAttribute('role')
      heading?.removeAttribute('tabindex')
      heading?.removeAttribute('aria-label')
      container.classList.remove('byt-you-route')
      overlay.remove()
    },
  }
}
