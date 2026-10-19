import { createApp } from 'vue'

import App from '../../app/App.vue'
import { installInternalNavigation } from './navigation'
import { installHomepageSearch } from './search'
import './style.css'
import './library.css'
import './navigation.css'
import './subscriptions.css'
import './search.css'

function isBilibiliHomepage(): boolean {
  return location.hostname === 'www.bilibili.com' && (location.pathname === '/' || location.pathname === '')
}

async function waitForBody(): Promise<HTMLElement> {
  if (document.body)
    return document.body

  return await new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.body)
        return
      observer.disconnect()
      resolve(document.body)
    })
    observer.observe(document.documentElement, { childList: true })
  })
}

export default defineContentScript({
  matches: ['https://www.bilibili.com/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  async main(ctx) {
    if (!isBilibiliHomepage())
      return

    const body = await waitForBody()
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'

    const ui = await createShadowRootUi(ctx, {
      name: 'biliyoutube-root',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        const app = createApp(App)
        app.mount(container)
        const navigation = installInternalNavigation(container)
        const search = installHomepageSearch(container)
        document.documentElement.classList.remove('byt-homepage-booting')
        return { app, navigation, search }
      },
      onRemove(state) {
        state?.search.destroy()
        state?.navigation.destroy()
        state?.app.unmount()
        document.documentElement.classList.remove('byt-homepage-booting')
        body.style.overflow = previousOverflow
      },
    })

    ui.mount()
  },
})
