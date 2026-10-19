let scheduled = false

function placeBytBesideNativeSettings() {
  const setting = document.querySelector<HTMLElement>('.bpx-player-ctrl-setting')
  const button = document.querySelector<HTMLElement>('.byt-player-settings-button')
  if (!setting || !button || setting.parentElement !== button.parentElement)
    return

  if (setting.nextElementSibling !== button)
    setting.insertAdjacentElement('afterend', button)
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
        placeBytBesideNativeSettings()
      })
    }

    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })

    const timer = window.setInterval(schedule, 700)
    ctx.onInvalidated(() => {
      observer.disconnect()
      window.clearInterval(timer)
    })
  },
})
