import { callApi } from '../../lib/api'
import type {
  BiliHistoryPage,
  BiliUser,
  BiliWatchLaterPage,
} from '../../types/bilibili'

export interface YouLibraryBridge {
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

function isYouRoute(): boolean {
  return location.hash === '#biliyoutube/you'
}

function pushHash(hash: string) {
  const next = new URL(location.href)
  next.hash = hash
  window.history.pushState({ biliyoutubeYouLibrary: hash }, '', `${next.pathname}${next.search}${next.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

export function installYouLibrary(container: HTMLElement): YouLibraryBridge {
  const overlay = element('section', 'byt-you-overlay')
  overlay.hidden = true
  container.append(overlay)

  let renderToken = 0
  let heading: HTMLElement | null = null
  let observer: MutationObserver | null = null

  function sidebarSection(): HTMLElement | null {
    return Array.from(container.querySelectorAll<HTMLElement>('.sidebar-section'))
      .find(section => section.querySelector('.static-heading h2')?.textContent?.trim() === '你') ?? null
  }

  function ensureSidebarHook() {
    const section = sidebarSection()
    if (!section)
      return

    const currentHeading = section.querySelector<HTMLElement>('.section-heading-link.static-heading')
    if (!currentHeading || currentHeading === heading)
      return

    heading?.removeEventListener('click', onHeadingClick)
    heading?.removeEventListener('keydown', onHeadingKeydown)
    heading = currentHeading
    heading.classList.add('byt-you-heading')
    heading.setAttribute('role', 'button')
    heading.setAttribute('tabindex', '0')
    heading.setAttribute('aria-label', '打开你的内容')
    heading.addEventListener('click', onHeadingClick)
    heading.addEventListener('keydown', onHeadingKeydown)
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

  function setSidebarActive(active: boolean) {
    container.classList.toggle('byt-you-route', active)
    heading?.classList.toggle('byt-you-active', active)
  }

  function hideOverlay() {
    renderToken += 1
    overlay.hidden = true
    overlay.replaceChildren()
    setSidebarActive(false)
  }

  function makeHeader(): HTMLElement {
    const header = element('header', 'byt-you-page-header')
    header.append(
      text(element('h1'), '你'),
      text(element('p'), '观看记录、播放列表和稍后再看'),
    )
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
    setSidebarActive(true)
    overlay.hidden = false
    overlay.scrollTop = 0
    overlay.replaceChildren()

    const page = element('div', 'byt-you-page')
    const status = text(element('div', 'byt-you-status'), '正在加载…')
    page.append(makeHeader(), status)
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
        makeShortcut('稍后再看', '查看留到之后的视频', '#biliyoutube/watch-later'),
      )
      page.append(shortcuts)

      const previews = element('div', 'byt-you-preview-stack')
      page.append(previews)

      const [historyResult, laterResult] = await Promise.allSettled([
        callApi<BiliHistoryPage>({ type: 'history', filter: 'archive', cursor: null }),
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
          const title = text(element('a', 'byt-you-mini-title'), item.title)
          title.href = item.url
          card.append(thumb, title)
          grid.append(card)
        }
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

  function syncFromLocation() {
    ensureSidebarHook()
    if (isYouRoute())
      void renderYou()
    else
      hideOverlay()
  }

  ensureSidebarHook()
  observer = new MutationObserver(() => ensureSidebarHook())
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
      heading?.classList.remove('byt-you-heading', 'byt-you-active')
      heading?.removeAttribute('role')
      heading?.removeAttribute('tabindex')
      heading?.removeAttribute('aria-label')
      container.classList.remove('byt-you-route')
      overlay.remove()
    },
  }
}
