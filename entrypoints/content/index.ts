import { createApp } from 'vue'

import App from '../../app/App.vue'
import './style.css'
import './library.css'

function isBilibiliHomepage(): boolean {
  return location.hostname === 'www.bilibili.com' && (location.pathname === '/' || location.pathname === '')
}

export default defineContentScript({
  matches: ['https://www.bilibili.com/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    if (!isBilibiliHomepage())
      return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const ui = await createShadowRootUi(ctx, {
      name: 'biliyoutube-root',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        const app = createApp(App)
        app.mount(container)
        return app
      },
      onRemove(app) {
        app?.unmount()
        document.body.style.overflow = previousOverflow
      },
    })

    ui.mount()
  },
})
