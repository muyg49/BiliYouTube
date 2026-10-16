<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { callApi } from '../lib/api'
import type { BiliFollowing, BiliUser, BiliVideo } from '../types/bilibili'

const user = ref<BiliUser | null>(null)
const videos = ref<BiliVideo[]>([])
const following = ref<BiliFollowing[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const page = ref(1)
const errorMessage = ref('')
const searchKeyword = ref('')
const contentRef = ref<HTMLElement | null>(null)

const chips = ['全部', '音乐', '游戏', '知识', '科技', '影视', '动画', '生活', '美食', '数码', '汽车']

const navItems = [
  { label: '首页', icon: 'home', href: 'https://www.bilibili.com/' },
  { label: '动态', icon: 'dynamic', href: 'https://t.bilibili.com/' },
]

const libraryItems = computed(() => [
  { label: '历史记录', icon: 'history', href: 'https://www.bilibili.com/history' },
  { label: '收藏', icon: 'favorite', href: user.value ? `https://space.bilibili.com/${user.value.mid}/favlist` : 'https://www.bilibili.com/account/favlist' },
  { label: '稍后再看', icon: 'later', href: 'https://www.bilibili.com/watchlater/list' },
])

const visibleFollowing = computed(() => following.value.slice(0, 9))

function iconPath(icon: string): string {
  const paths: Record<string, string> = {
    menu: 'M4 6h16M4 12h16M4 18h16',
    home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    dynamic: 'M4 6h16v12H4zM8 10h8M8 14h5',
    history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
    favorite: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.8 6.4 21l1.1-6.2L3 9.6l6.2-.9z',
    later: 'M12 7v5l3 2M4 3h16v18H4z',
    search: 'm21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
    upload: 'M12 16V4m0 0L7 9m5-5 5 5M5 20h14',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  }
  return paths[icon] ?? paths.home!
}

function search() {
  const keyword = searchKeyword.value.trim()
  if (!keyword)
    return
  window.location.href = `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`
}

function searchChip(chip: string) {
  if (chip === '全部') {
    contentRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  window.location.href = `https://search.bilibili.com/all?keyword=${encodeURIComponent(chip)}`
}

function formatViews(value: number): string {
  if (value >= 100_000_000)
    return `${(value / 100_000_000).toFixed(1)}亿次观看`
  if (value >= 10_000)
    return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}万次观看`
  return `${value}次观看`
}

function relativeTime(timestamp: number): string {
  if (!timestamp)
    return ''
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - timestamp))
  const units: Array<[number, string]> = [
    [31_536_000, '年前'],
    [2_592_000, '个月前'],
    [604_800, '周前'],
    [86_400, '天前'],
    [3_600, '小时前'],
    [60, '分钟前'],
  ]
  for (const [size, label] of units) {
    if (seconds >= size)
      return `${Math.floor(seconds / size)}${label}`
  }
  return '刚刚'
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

async function loadInitial() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [account, feed] = await Promise.all([
      callApi<BiliUser | null>({ type: 'user' }),
      callApi<BiliVideo[]>({ type: 'feed', page: 1 }),
    ])
    user.value = account
    videos.value = feed

    if (account) {
      following.value = await callApi<BiliFollowing[]>({
        type: 'following',
        mid: account.mid,
        page: 1,
      })
    }
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value)
    return
  loadingMore.value = true
  try {
    const nextPage = page.value + 1
    const next = await callApi<BiliVideo[]>({ type: 'feed', page: nextPage })
    const known = new Set(videos.value.map(video => video.bvid))
    videos.value.push(...next.filter(video => !known.has(video.bvid)))
    page.value = nextPage
  }
  catch (error) {
    console.warn('[BiliYouTube] Failed to load more videos', error)
  }
  finally {
    loadingMore.value = false
  }
}

function handleScroll(event: Event) {
  const el = event.currentTarget as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 900)
    void loadMore()
}

onMounted(loadInitial)
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-section">
        <button class="icon-button menu-button" aria-label="菜单">
          <svg viewBox="0 0 24 24"><path :d="iconPath('menu')" /></svg>
        </button>
        <a class="brand" href="https://www.bilibili.com/" aria-label="BiliYouTube 首页">
          <span class="brand-mark">▶</span>
          <span class="brand-text">BiliYouTube</span>
        </a>
      </div>

      <form class="search-wrap" @submit.prevent="search">
        <div class="search-box">
          <input v-model="searchKeyword" type="search" placeholder="搜索" autocomplete="off">
          <button type="submit" class="search-button" aria-label="搜索">
            <svg viewBox="0 0 24 24"><path :d="iconPath('search')" /></svg>
          </button>
        </div>
      </form>

      <div class="top-actions">
        <a class="create-button" href="https://member.bilibili.com/platform/upload/video/frame">
          <svg viewBox="0 0 24 24"><path :d="iconPath('upload')" /></svg>
          <span>投稿</span>
        </a>
        <a class="icon-button" href="https://message.bilibili.com/" aria-label="消息">
          <svg viewBox="0 0 24 24"><path :d="iconPath('bell')" /></svg>
        </a>
        <a v-if="user" class="avatar-link" :href="`https://space.bilibili.com/${user.mid}`">
          <img :src="user.face" :alt="user.name">
        </a>
        <a v-else class="login-button" href="https://passport.bilibili.com/login">登录</a>
      </div>
    </header>

    <aside class="sidebar">
      <nav class="sidebar-group">
        <a v-for="item in navItems" :key="item.label" class="sidebar-item" :href="item.href" :class="{ active: item.label === '首页' }">
          <svg viewBox="0 0 24 24"><path :d="iconPath(item.icon)" /></svg>
          <span>{{ item.label }}</span>
        </a>
      </nav>

      <div class="divider" />

      <section class="sidebar-section">
        <h2>你</h2>
        <a v-for="item in libraryItems" :key="item.label" class="sidebar-item" :href="item.href">
          <svg viewBox="0 0 24 24"><path :d="iconPath(item.icon)" /></svg>
          <span>{{ item.label }}</span>
        </a>
      </section>

      <template v-if="visibleFollowing.length">
        <div class="divider" />
        <section class="sidebar-section subscriptions">
          <h2>订阅</h2>
          <a v-for="channel in visibleFollowing" :key="channel.mid" class="channel-item" :href="`https://space.bilibili.com/${channel.mid}`">
            <img :src="channel.face" :alt="channel.uname">
            <span>{{ channel.uname }}</span>
          </a>
          <a v-if="following.length > visibleFollowing.length" class="show-more" :href="user ? `https://space.bilibili.com/${user.mid}/relation/follow` : '#'">显示更多</a>
        </section>
      </template>
    </aside>

    <main ref="contentRef" class="main-area" @scroll.passive="handleScroll">
      <div class="chipbar">
        <button v-for="chip in chips" :key="chip" class="chip" :class="{ active: chip === '全部' }" @click="searchChip(chip)">
          {{ chip }}
        </button>
      </div>

      <div v-if="loading" class="status-page">
        <div class="spinner" />
        <p>正在加载推荐内容…</p>
      </div>

      <div v-else-if="errorMessage" class="status-page error-state">
        <h2>无法加载 Bilibili 内容</h2>
        <p>{{ errorMessage }}</p>
        <button @click="loadInitial">重试</button>
      </div>

      <section v-else class="feed-grid" aria-label="推荐视频">
        <article v-for="video in videos" :key="video.bvid" class="video-card">
          <a class="thumbnail-link" :href="`https://www.bilibili.com/video/${video.bvid}`">
            <img class="thumbnail" :src="video.pic" :alt="video.title" loading="lazy">
            <span class="duration">{{ formatDuration(video.duration) }}</span>
          </a>

          <div class="video-meta">
            <a class="channel-avatar" :href="`https://space.bilibili.com/${video.owner.mid}`" :aria-label="video.owner.name">
              <img v-if="video.owner.face" :src="video.owner.face" :alt="video.owner.name" loading="lazy">
              <span v-else>{{ video.owner.name.slice(0, 1) }}</span>
            </a>
            <div class="video-copy">
              <a class="video-title" :href="`https://www.bilibili.com/video/${video.bvid}`">{{ video.title }}</a>
              <a class="channel-name" :href="`https://space.bilibili.com/${video.owner.mid}`">{{ video.owner.name }}</a>
              <div class="video-stats">
                <span>{{ formatViews(video.view) }}</span>
                <span v-if="video.published">• {{ relativeTime(video.published) }}</span>
              </div>
            </div>
            <button class="more-button" aria-label="更多操作">⋮</button>
          </div>
        </article>
      </section>

      <div v-if="loadingMore" class="loading-more">
        <div class="spinner small" />
      </div>
    </main>
  </div>
</template>
