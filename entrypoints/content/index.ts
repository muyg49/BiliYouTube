import { createApp } from 'vue'

import App from '../../app/App.vue'
import { installInternalNavigation } from './navigation'
import { installHomepageSearch } from './search'
import { installHomepageShell } from './shell'
import { installYouLibrary } from './you-library'
import './style.css'
import './library.css'
import './navigation.css'
import './subscriptions.css'
import './search.css'
import './shell.css'
import './you-library.css'

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
        const shell = installHomepageShell(container)
        const navigation = installInternalNavigation(container)
        const search = installHomepageSearch(container)
        const youLibrary = installYouLibrary(container)
        document.documentElement.classList.remove('byt-homepage-booting')
        return { app, shell, navigation, search, youLibrary }
      },
      onRemove(state) {
        state?.youLibrary.destroy()
        state?.search.destroy()
        state?.navigation.destroy()
        state?.shell.destroy()
        state?.app.unmount()
        document.documentElement.classList.remove('byt-homepage-booting')
        body.style.overflow = previousOverflow
      },
    })

    ui.mount()
  },
})
