function closeDrawer(root: HTMLElement, menu: HTMLButtonElement) {
  root.classList.remove('drawer-open')
  document.documentElement.classList.remove('byt-watch-drawer-open')
  menu.setAttribute('aria-expanded', 'false')
}

export default defineContentScript({
  matches: ['https://www.bilibili.com/video/*'],
  runAt: 'document_start',
  main(ctx) {
    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element))
        return

      const root = target.closest<HTMLElement>('#biliyoutube-watch-chrome')
      if (!root?.classList.contains('drawer-open'))
        return

      const menu = target.closest<HTMLButtonElement>('.byt-watch-topbar-left > .byt-watch-icon-button')
      if (!menu || !root.contains(menu))
        return

      event.preventDefault()
      event.stopImmediatePropagation()
      closeDrawer(root, menu)
    }

    document.addEventListener('click', onClick, true)
    ctx.onInvalidated(() => document.removeEventListener('click', onClick, true))
  },
})
