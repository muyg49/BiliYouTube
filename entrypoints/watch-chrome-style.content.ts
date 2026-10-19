import '../styles/watch-popover.css'

export default defineContentScript({
  matches: ['https://www.bilibili.com/video/*'],
  cssInjectionMode: 'manifest',
  main() {},
})
