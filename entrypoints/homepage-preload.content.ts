import '../styles/homepage-preload.css'

function isBilibiliHomepage(): boolean {
  return location.hostname === 'www.bilibili.com' && (location.pathname === '/' || location.pathname === '')
}

export default defineContentScript({
  matches: ['https://www.bilibili.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',
  main(ctx) {
    if (!isBilibiliHomepage())
      return

    const root = document.documentElement
    root.classList.add('byt-homepage-booting')

    const fallbackTimer = window.setTimeout(() => {
      root.classList.remove('byt-homepage-booting')
    }, 10_000)

    ctx.onInvalidated(() => {
      window.clearTimeout(fallbackTimer)
      root.classList.remove('byt-homepage-booting')
    })
  },
})
