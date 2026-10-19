const playlistRoots = [
  '.video-pod',
  '.multi-page-v1',
  '.multi-page',
  '.base-video-sections-v1',
  '.video-sections-v1',
]

const activeSelectors = [
  '.video-pod__item.active',
  '.video-pod__item:has(.simple-base-item.active)',
  '.simple-base-item.active',
  '.multip-list-item-active',
  '.page-item.active',
  '[aria-current="true"]',
  '[aria-current="page"]',
]

let scheduled = false
let lastCenteredKey = ''
let lastLocationKey = ''

function currentBvid(): string | null {
  return location.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/i)?.[1] ?? null
}

function placeBytBesideNativeSettings() {
  const setting = document.querySelector<HTMLElement>('.bpx-player-ctrl-setting')
  const button = document.querySelector<HTMLElement>('.byt-player-settings-button')
  if (!setting || !button || setting.parentElement !== button.parentElement)
    return

  if (setting.nextElementSibling !== button)
    setting.insertAdjacentElement('afterend', button)
}

function normalizePlaylistItem(node: HTMLElement): HTMLElement {
  return node.closest<HTMLElement>(
    '.video-pod__item, .multip-list-item, .page-item, [class*="episode-item"], [class*="section-item"], li',
  ) ?? node
}

function findActiveItem(root: HTMLElement): HTMLElement | null {
  for (const selector of activeSelectors) {
    const match = root.querySelector<HTMLElement>(selector)
    if (match)
      return normalizePlaylistItem(match)
  }

  const bvid = currentBvid()
  if (!bvid)
    return null

  const items = root.querySelectorAll<HTMLElement>(
    '.video-pod__item[data-key], .video-pod__item[data-bsb-bvid], [data-key], [data-bsb-bvid]',
  )
  for (const item of items) {
    if (item.dataset.key === bvid || item.dataset.bsbBvid === bvid)
      return normalizePlaylistItem(item)
  }

  const currentTarget = `${location.pathname}${location.search}`
  const links = root.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"]')
  for (const link of links) {
    try {
      const url = new URL(link.href, location.href)
      if (`${url.pathname}${url.search}` === currentTarget || url.pathname === location.pathname)
        return normalizePlaylistItem(link)
    }
    catch {
      // Ignore malformed or transient hrefs.
    }
  }

  return null
}

function findScrollableAncestor(item: HTMLElement, root: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = item.parentElement
  while (node) {
    const style = getComputedStyle(node)
    const overflowY = style.overflowY
    if (node.scrollHeight > node.clientHeight + 8 && (overflowY === 'auto' || overflowY === 'scroll'))
      return node
    if (node === root)
      break
    node = node.parentElement
  }

  const candidates = root.querySelectorAll<HTMLElement>(
    '.video-pod__body, .video-pod__list, .cur-list, .list-box, .video-sections-content-list, [class*="section-list"], [class*="episode-list"]',
  )
  for (const candidate of candidates) {
    if (candidate.contains(item) && candidate.scrollHeight > candidate.clientHeight + 8)
      return candidate
  }

  if (root.scrollHeight > root.clientHeight + 8)
    return root
  return null
}

function itemKey(item: HTMLElement): string {
  return [
    `${location.pathname}${location.search}`,
    item.dataset.key ?? '',
    item.dataset.bsbBvid ?? '',
    item.getAttribute('data-index') ?? '',
    item.textContent?.trim().slice(0, 80) ?? '',
  ].join('|')
}

function centerActivePlaylistItem() {
  const locationKey = `${location.pathname}${location.search}`
  if (locationKey !== lastLocationKey) {
    lastLocationKey = locationKey
    lastCenteredKey = ''
  }

  for (const selector of playlistRoots) {
    const roots = document.querySelectorAll<HTMLElement>(selector)
    for (const root of roots) {
      const item = findActiveItem(root)
      if (!item)
        continue
      const scroller = findScrollableAncestor(item, root)
      if (!scroller)
        continue

      const key = itemKey(item)
      if (key === lastCenteredKey)
        return

      const itemRect = item.getBoundingClientRect()
      const scrollerRect = scroller.getBoundingClientRect()
      const targetTop = scroller.scrollTop
        + (itemRect.top - scrollerRect.top)
        - (scroller.clientHeight - itemRect.height) / 2

      scroller.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth',
      })
      lastCenteredKey = key
      return
    }
  }
}

function syncUiFixes() {
  placeBytBesideNativeSettings()
  centerActivePlaylistItem()
}

export default defineContentScript({
  matches: ['https://www.bilibili.com/video/*'],
  runAt: 'document_start',
  main(ctx) {
    const schedule = () => {
      if (scheduled)
        return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        syncUiFixes()
      })
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-current', 'data-key', 'data-bsb-bvid'],
    })

    const timer = window.setInterval(schedule, 700)
    ctx.onInvalidated(() => {
      observer.disconnect()
      window.clearInterval(timer)
    })
  },
})
