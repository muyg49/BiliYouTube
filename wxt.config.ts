import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'BiliYouTube',
    description: 'A YouTube-inspired desktop interface for Bilibili.',
    permissions: ['storage'],
    host_permissions: [
      'https://www.bilibili.com/*',
      'https://api.bilibili.com/*',
      'https://space.bilibili.com/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: 'biliyoutube@muyg49.github.io',
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['websiteContent'],
        },
      },
    },
  },
})
