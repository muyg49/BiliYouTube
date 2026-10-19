import { browser } from 'wxt/browser'

interface PlaybackSettings {
  rememberSpeed?: boolean
}

interface StorageChangeLike {
  oldValue?: unknown
  newValue?: unknown
}

const SETTINGS_KEY = 'byt:watch:settings'
const LAST_SPEED_KEY = 'byt:watch:last-speed'

let rememberSpeed = false
let rememberedSpeed: number | null = null
let activeVideo: HTMLVideoElement | null = null
let videoCleanup: (() => void) | null = null
let userSpeedIntentUntil = 0
let restoringSpeed = false
let mutationScheduled = false

function validSpeed(value: unknown): number | null {
  const speed = Number(value)
  return Number.isFinite(speed) && speed >= 0.25 && speed <= 4 ? speed : null
}

async function loadState() {
  const stored = await browser.storage.local.get([SETTINGS_KEY, LAST_SPEED_KEY])
  const settings = stored[SETTINGS_KEY] as PlaybackSettings | undefined
  rememberSpeed = Boolean(settings?.rememberSpeed)
  rememberedSpeed = validSpeed(stored[LAST_SPEED_KEY])
}

function findVideo(): HTMLVideoElement | null {
  const player = document.querySelector<HTMLElement>('.bpx-player-container, #bilibili-player, #bilibiliPlayer')
  return player?.querySelector<HTMLVideoElement>('video') ?? document.querySelector<HTMLVideoElement>('video')
}

function applyRememberedSpeed(video: HTMLVideoElement | null) {
  if (!video || !rememberSpeed || rememberedSpeed === null)
    return
  if (Math.abs(video.playbackRate - rememberedSpeed) <= 0.01)
    return

  restoringSpeed = true
  try {
    video.defaultPlaybackRate = rememberedSpeed
    video.playbackRate = rememberedSpeed
  }
  finally {
    queueMicrotask(() => {
      restoringSpeed = false
    })
  }
}

async function persistCurrentSpeed(video: HTMLVideoElement) {
  if (!rememberSpeed)
    return
  const speed = validSpeed(video.playbackRate)
  if (speed === null)
    return
  rememberedSpeed = speed
  await browser.storage.local.set({ [LAST_SPEED_KEY]: speed })
}

function markSpeedIntent() {
  userSpeedIntentUntil = performance.now() + 1800
}

function speedControlFromEvent(event: Event): boolean {
  const target = event.target
  if (!(target instanceof Element))
    return false

  if (target.closest([
    '.bpx-player-ctrl-playbackrate',
    '.bpx-player-ctrl-playbackrate-menu',
    '[class*="playbackrate"]',
    '[class*="playback-rate"]',
    '[class*="playbackRate"]',
  ].join(',')))
    return true

  const text = target.textContent?.trim() ?? ''
  return /^(?:0\.25|0\.5|0\.75|1(?:\.0)?|1\.25|1\.5|1\.75|2(?:\.0)?|2\.5|3|4)\s*(?:x|×|倍)?$/i.test(text)
}

function scheduleCapture(video: HTMLVideoElement) {
  window.setTimeout(() => void persistCurrentSpeed(video), 0)
  window.setTimeout(() => void persistCurrentSpeed(video), 100)
  window.setTimeout(() => void persistCurrentSpeed(video), 300)
}

function scheduleRestore(video: HTMLVideoElement | null) {
  if (!video)
    return
  applyRememberedSpeed(video)
  window.setTimeout(() => applyRememberedSpeed(video), 0)
  window.setTimeout(() => applyRememberedSpeed(video), 120)
  window.setTimeout(() => applyRememberedSpeed(video), 500)
}

function bindVideo(video: HTMLVideoElement) {
  if (video === activeVideo)
    return

  videoCleanup?.()
  activeVideo = video

  const restore = () => scheduleRestore(video)
  const onRateChange = () => {
    if (!rememberSpeed || restoringSpeed)
      return

    if (performance.now() <= userSpeedIntentUntil) {
      scheduleCapture(video)
      return
    }

    if (rememberedSpeed !== null && Math.abs(video.playbackRate - rememberedSpeed) > 0.01)
      scheduleRestore(video)
  }

  video.addEventListener('loadedmetadata', restore)
  video.addEventListener('durationchange', restore)
  video.addEventListener('canplay', restore)
  video.addEventListener('playing', restore)
  video.addEventListener('ratechange', onRateChange)

  videoCleanup = () => {
    video.removeEventListener('loadedmetadata', restore)
    video.removeEventListener('durationchange', restore)
    video.removeEventListener('canplay', restore)
    video.removeEventListener('playing', restore)
    video.removeEventListener('ratechange', onRateChange)
  }

  scheduleRestore(video)
  window.setTimeout(() => applyRememberedSpeed(video), 1200)
  window.setTimeout(() => applyRememberedSpeed(video), 3000)
}

function syncVideo() {
  const video = findVideo()
  if (video)
    bindVideo(video)
  if (video === activeVideo)
    applyRememberedSpeed(video)
}

export default defineContentScript({
  matches: ['https://www.bilibili.com/video/*'],
  runAt: 'document_start',
  async main(ctx) {
    await loadState()

    const start = () => {
      if (!document.body) {
        requestAnimationFrame(start)
        return
      }
      syncVideo()
    }
    start()

    const observer = new MutationObserver(() => {
      if (mutationScheduled)
        return
      mutationScheduled = true
      requestAnimationFrame(() => {
        mutationScheduled = false
        syncVideo()
      })
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })

    const onPointerDown = (event: PointerEvent) => {
      if (!speedControlFromEvent(event))
        return
      markSpeedIntent()
    }

    const onClick = (event: MouseEvent) => {
      if (!speedControlFromEvent(event))
        return
      markSpeedIntent()
      if (activeVideo)
        scheduleCapture(activeVideo)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '>' || event.key === '<' || event.key === '.' || event.key === ',') {
        markSpeedIntent()
        if (activeVideo)
          scheduleCapture(activeVideo)
      }
    }

    const onStorageChanged = (changes: Record<string, StorageChangeLike>, areaName: string) => {
      if (areaName !== 'local')
        return
      if (changes[SETTINGS_KEY]) {
        const value = changes[SETTINGS_KEY].newValue as PlaybackSettings | undefined
        rememberSpeed = Boolean(value?.rememberSpeed)
        if (rememberSpeed)
          scheduleRestore(activeVideo)
      }
      if (changes[LAST_SPEED_KEY]) {
        rememberedSpeed = validSpeed(changes[LAST_SPEED_KEY].newValue)
        if (rememberSpeed)
          scheduleRestore(activeVideo)
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)
    browser.storage.onChanged.addListener(onStorageChanged)

    const timer = window.setInterval(syncVideo, 500)

    ctx.onInvalidated(() => {
      observer.disconnect()
      window.clearInterval(timer)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown, true)
      browser.storage.onChanged.removeListener(onStorageChanged)
      videoCleanup?.()
      videoCleanup = null
      activeVideo = null
    })
  },
})
