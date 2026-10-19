import '../styles/watch-enhancements.css'

interface PlaybackSettings {
  rememberSpeed: boolean
  loudnessNormalization: boolean
}

interface StoredProgress {
  time: number
  duration: number
  updatedAt: number
}

interface StoredCollectionState {
  target: string
  updatedAt: number
}

interface CollectionContext {
  container: HTMLElement
  links: HTMLAnchorElement[]
  targets: string[]
  currentIndex: number
  currentTarget: string
  key: string
}

interface CapturableVideoElement extends HTMLVideoElement {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

interface AudioPipeline {
  context: AudioContext
  stream: MediaStream
  source: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  silentSink: GainNode
  samples: Float32Array<ArrayBuffer>
  timer: number | null
  smoothedRms: number
  normalizationFactor: number
  userVolume: number
  lastAppliedVolume: number
  onVolumeChange: () => void
}

const SETTINGS_KEY = 'byt:watch:settings'
const LAST_SPEED_KEY = 'byt:watch:last-speed'
const PROGRESS_PREFIX = 'byt:watch:progress:'
const COLLECTION_PREFIX = 'byt:watch:collection:'
const MANUAL_NAV_KEY = 'byt:watch:manual-collection-target'

const defaults: PlaybackSettings = {
  rememberSpeed: false,
  loudnessNormalization: true,
}

const collectionHints = [
  'video-pod', 'video-sections', 'multi-page', 'episode', 'season', 'section-list', 'cur-list', 'list-box',
]

const watchAdSelectors = [
  '#slide_ad',
  '.ad-report',
  '.video-card-ad-small',
  '.video-page-ad',
  '.commercial-card',
  '.bili-video-card__info--ad',
  '[data-ad-report]',
]

let settings: PlaybackSettings = { ...defaults }
let rememberedSpeed: number | null = null
let lastUserInteractionAt = 0
let activeVideo: HTMLVideoElement | null = null
let videoCleanup: (() => void) | null = null
let mutationScheduled = false
let locationKey = ''
let activeCollection: CollectionContext | null = null
let collectionCheckToken = 0
let lastProgressWrite = 0
let lastCollectionWrite = 0
let settingsPanel: HTMLElement | null = null
let fallbackSettingsButton: HTMLButtonElement | null = null
let settingsPinned = false
let settingsCloseTimer: number | null = null
const audioPipelines = new WeakMap<HTMLVideoElement, AudioPipeline>()

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hashText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

async function loadSettings() {
  const stored = await browser.storage.local.get([SETTINGS_KEY, LAST_SPEED_KEY])
  const value = stored[SETTINGS_KEY] as Partial<PlaybackSettings> | undefined
  settings = {
    rememberSpeed: value?.rememberSpeed ?? defaults.rememberSpeed,
    loudnessNormalization: value?.loudnessNormalization ?? defaults.loudnessNormalization,
  }
  const speed = Number(stored[LAST_SPEED_KEY])
  rememberedSpeed = Number.isFinite(speed) && speed >= 0.25 && speed <= 4 ? speed : null
}

async function saveSettings() {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings })
}

function videoTarget(input: string | URL = location.href): string | null {
  try {
    const url = input instanceof URL ? input : new URL(input, location.href)
    const match = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]+|av\d+)/i)
    if (!match)
      return null
    const p = Number(url.searchParams.get('p') || '1')
    return `${url.pathname.replace(/\/$/, '')}${Number.isFinite(p) && p > 1 ? `?p=${p}` : ''}`
  }
  catch {
    return null
  }
}

function storageProgressKey(target: string): string {
  return `${PROGRESS_PREFIX}${hashText(target)}`
}

function storageCollectionKey(key: string): string {
  return `${COLLECTION_PREFIX}${key}`
}

function nativeSettingsButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.bpx-player-ctrl-setting')
    ?? document.querySelector<HTMLElement>('[class~="bpx-player-ctrl-setting"]')
}

function hideAdElement(element: HTMLElement) {
  element.dataset.bytAdHidden = 'true'
  element.style.setProperty('display', 'none', 'important')
}

function hideWatchAds() {
  document.querySelectorAll<HTMLElement>(watchAdSelectors.join(',')).forEach(hideAdElement)

  const right = document.querySelector<HTMLElement>('.right-container, .recommend-list-v1, .recommend-list-container')
  if (!right)
    return

  right.querySelectorAll<HTMLAnchorElement>('a[href*="cm.bilibili.com"], a[href*="ad.bilibili.com"]')
    .forEach((anchor) => {
      const card = anchor.closest<HTMLElement>(
        '.video-card-ad-small, .video-page-card-small, .video-page-card, [class*="ad-card"], [class*="commercial"], li',
      )
      if (card)
        hideAdElement(card)
    })

  for (const badge of right.querySelectorAll<HTMLElement>('span, i, em, div')) {
    if (badge.textContent?.trim() !== '广告')
      continue
    const card = badge.closest<HTMLElement>(
      '.video-card-ad-small, .video-page-card-small, .video-page-card, [class*="ad-card"], [class*="commercial"], li',
    )
    if (card && right.contains(card))
      hideAdElement(card)
  }
}

function buildToggleRow(
  label: string,
  description: string,
  checked: boolean,
  onChange: (value: boolean) => void,
): HTMLElement {
  const row = document.createElement('label')
  row.className = 'byt-player-setting-row'
  const copy = document.createElement('span')
  copy.className = 'byt-player-setting-copy'
  const title = document.createElement('strong')
  title.textContent = label
  const detail = document.createElement('small')
  detail.textContent = description
  copy.append(title, detail)

  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = checked
  const switcher = document.createElement('span')
  switcher.className = 'byt-player-setting-switch'
  input.addEventListener('change', () => onChange(input.checked))

  row.append(copy, input, switcher)
  return row
}

function refreshSettingsPanel() {
  if (!settingsPanel)
    return
  const speed = settingsPanel.querySelector<HTMLInputElement>('input[data-byt-setting="speed"]')
  const loudness = settingsPanel.querySelector<HTMLInputElement>('input[data-byt-setting="loudness"]')
  if (speed)
    speed.checked = settings.rememberSpeed
  if (loudness)
    loudness.checked = settings.loudnessNormalization
}

async function updateRememberSpeed(enabled: boolean) {
  settings.rememberSpeed = enabled
  if (enabled && activeVideo) {
    rememberedSpeed = clamp(activeVideo.playbackRate, 0.25, 4)
    await browser.storage.local.set({ [LAST_SPEED_KEY]: rememberedSpeed })
  }
  await saveSettings()
  refreshSettingsPanel()
  if (enabled)
    void restorePlaybackSpeed(activeVideo)
}

async function updateLoudness(enabled: boolean) {
  settings.loudnessNormalization = enabled
  await saveSettings()
  refreshSettingsPanel()
  if (activeVideo)
    updateAudioPipeline(activeVideo)
}

function buildSettingsPanel(): HTMLElement {
  const panel = document.createElement('section')
  panel.className = 'byt-player-settings-panel'
  const heading = document.createElement('div')
  heading.className = 'byt-player-settings-heading'
  heading.textContent = 'BiliYouTube'

  const speedRow = buildToggleRow(
    '记忆播放速度',
    '开启后，新视频沿用你上一次选择的倍速。',
    settings.rememberSpeed,
    value => void updateRememberSpeed(value),
  )
  speedRow.querySelector('input')?.setAttribute('data-byt-setting', 'speed')

  const loudnessRow = buildToggleRow(
    '响度均衡',
    '安全衰减过响视频；原生音频始终直出，不由扩展接管。',
    settings.loudnessNormalization,
    value => void updateLoudness(value),
  )
  loudnessRow.querySelector('input')?.setAttribute('data-byt-setting', 'loudness')

  panel.append(heading, speedRow, loudnessRow)
  return panel
}

function cancelSettingsClose() {
  if (settingsCloseTimer === null)
    return
  window.clearTimeout(settingsCloseTimer)
  settingsCloseTimer = null
}

function openFloatingSettings() {
  cancelSettingsClose()
  settingsPanel?.classList.add('is-open')
}

function closeFloatingSettings(force = false) {
  cancelSettingsClose()
  if (force)
    settingsPinned = false
  if (!settingsPinned)
    settingsPanel?.classList.remove('is-open')
}

function scheduleSettingsClose() {
  cancelSettingsClose()
  if (settingsPinned)
    return
  settingsCloseTimer = window.setTimeout(() => {
    settingsCloseTimer = null
    if (!settingsPinned)
      settingsPanel?.classList.remove('is-open')
  }, 180)
}

function ensureFallbackSettingsButton() {
  if (fallbackSettingsButton?.isConnected && settingsPanel?.isConnected)
    return

  const setting = nativeSettingsButton()
  if (!setting)
    return
  const controls = setting.parentElement
  if (!controls)
    return

  settingsPanel?.remove()
  fallbackSettingsButton?.remove()
  settingsPinned = false

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'byt-player-settings-button'
  button.textContent = 'BYT'
  button.title = 'BiliYouTube 播放设置'
  button.setAttribute('aria-label', 'BiliYouTube 播放设置')

  const panel = buildSettingsPanel()
  panel.classList.add('byt-player-settings-panel-floating')
  controls.append(button, panel)
  fallbackSettingsButton = button
  settingsPanel = panel

  button.addEventListener('pointerenter', openFloatingSettings)
  button.addEventListener('pointerleave', scheduleSettingsClose)
  panel.addEventListener('pointerenter', cancelSettingsClose)
  panel.addEventListener('pointerleave', scheduleSettingsClose)

  button.addEventListener('click', (event) => {
    event.stopPropagation()
    settingsPinned = !settingsPinned
    if (settingsPinned)
      openFloatingSettings()
    else if (!button.matches(':hover') && !panel.matches(':hover'))
      closeFloatingSettings()
  })
}

function findVideo(): HTMLVideoElement | null {
  const player = document.querySelector<HTMLElement>('.bpx-player-container, #bilibili-player, #bilibiliPlayer')
  return player?.querySelector<HTMLVideoElement>('video') ?? document.querySelector<HTMLVideoElement>('video')
}

async function restorePlaybackSpeed(video: HTMLVideoElement | null) {
  if (!video || !settings.rememberSpeed || rememberedSpeed === null)
    return
  if (Math.abs(video.playbackRate - rememberedSpeed) > 0.01)
    video.playbackRate = rememberedSpeed
}

async function savePlaybackSpeed(video: HTMLVideoElement) {
  if (!settings.rememberSpeed || performance.now() - lastUserInteractionAt > 2000)
    return
  rememberedSpeed = clamp(video.playbackRate, 0.25, 4)
  await browser.storage.local.set({ [LAST_SPEED_KEY]: rememberedSpeed })
}

function captureVideoStream(video: HTMLVideoElement): MediaStream | null {
  const capturable = video as CapturableVideoElement
  const capture = capturable.captureStream ?? capturable.mozCaptureStream
  if (!capture)
    return null
  try {
    return capture.call(video)
  }
  catch {
    return null
  }
}

function applyNormalizedVolume(video: HTMLVideoElement, pipeline: AudioPipeline) {
  const nextVolume = clamp(pipeline.userVolume * pipeline.normalizationFactor, 0, 1)
  if (Math.abs(video.volume - nextVolume) < 0.004) {
    pipeline.lastAppliedVolume = video.volume
    return
  }
  pipeline.lastAppliedVolume = nextVolume
  video.volume = nextVolume
}

function restoreUserVolume(video: HTMLVideoElement, pipeline: AudioPipeline) {
  const restored = clamp(pipeline.userVolume, 0, 1)
  pipeline.normalizationFactor = 1
  pipeline.lastAppliedVolume = restored
  if (Math.abs(video.volume - restored) >= 0.004)
    video.volume = restored
}

function stopNormalizer(pipeline: AudioPipeline) {
  if (pipeline.timer !== null) {
    window.clearInterval(pipeline.timer)
    pipeline.timer = null
  }
}

function disposeAudioPipeline(video: HTMLVideoElement) {
  const pipeline = audioPipelines.get(video)
  if (!pipeline)
    return

  stopNormalizer(pipeline)
  video.removeEventListener('volumechange', pipeline.onVolumeChange)
  restoreUserVolume(video, pipeline)
  try {
    pipeline.source.disconnect()
    pipeline.analyser.disconnect()
    pipeline.silentSink.disconnect()
  }
  catch {
    // Nodes may already be detached during page teardown.
  }
  void pipeline.context.close().catch(() => {})
  audioPipelines.delete(video)
}

function startNormalizer(pipeline: AudioPipeline, video: HTMLVideoElement) {
  if (pipeline.timer !== null)
    return

  const tick = () => {
    if (!settings.loudnessNormalization || video !== activeVideo || video.muted || video.paused)
      return
    if (pipeline.context.state !== 'running')
      return

    pipeline.analyser.getFloatTimeDomainData(pipeline.samples)
    let squareSum = 0
    for (let index = 0; index < pipeline.samples.length; index++)
      squareSum += pipeline.samples[index]! * pipeline.samples[index]!
    const rms = Math.sqrt(squareSum / pipeline.samples.length)
    if (!Number.isFinite(rms) || rms < 0.004)
      return

    pipeline.smoothedRms = pipeline.smoothedRms
      ? pipeline.smoothedRms * 0.92 + rms * 0.08
      : rms

    // This intentionally only attenuates loud material. It never boosts or
    // reroutes native playback, so analyser/context failures cannot mute audio.
    const targetRms = 0.105
    const desiredFactor = clamp(targetRms / Math.max(pipeline.smoothedRms, 0.001), 0.55, 1)
    pipeline.normalizationFactor = pipeline.normalizationFactor * 0.88 + desiredFactor * 0.12
    applyNormalizedVolume(video, pipeline)
  }

  pipeline.timer = window.setInterval(tick, 250)
}

function createAudioPipeline(video: HTMLVideoElement): AudioPipeline | null {
  const stream = captureVideoStream(video)
  if (!stream || stream.getAudioTracks().length === 0)
    return null

  try {
    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    const silentSink = context.createGain()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.72
    silentSink.gain.value = 0

    // The copied media stream is analysed through a zero-gain sink. The actual
    // <video> audio path remains untouched and continues through Bilibili/Firefox.
    source.connect(analyser)
    analyser.connect(silentSink)
    silentSink.connect(context.destination)

    const pipeline: AudioPipeline = {
      context,
      stream,
      source,
      analyser,
      silentSink,
      samples: new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT)),
      timer: null,
      smoothedRms: 0,
      normalizationFactor: 1,
      userVolume: video.volume,
      lastAppliedVolume: video.volume,
      onVolumeChange: () => {},
    }

    pipeline.onVolumeChange = () => {
      if (Math.abs(video.volume - pipeline.lastAppliedVolume) < 0.004)
        return
      // Treat native player/user volume changes as the new requested baseline.
      pipeline.userVolume = video.volume
      pipeline.lastAppliedVolume = video.volume
    }

    video.addEventListener('volumechange', pipeline.onVolumeChange)
    audioPipelines.set(video, pipeline)
    startNormalizer(pipeline, video)
    return pipeline
  }
  catch (error) {
    console.debug('[BiliYouTube] safe loudness analysis unavailable for this media element', error)
    return null
  }
}

function resumeAudioPipeline(video: HTMLVideoElement) {
  const pipeline = audioPipelines.get(video)
  if (pipeline?.context.state === 'suspended')
    void pipeline.context.resume().catch(() => {})
}

function updateAudioPipeline(video: HTMLVideoElement) {
  if (!settings.loudnessNormalization) {
    disposeAudioPipeline(video)
    return
  }

  let pipeline = audioPipelines.get(video)
  if (!pipeline && !video.paused)
    pipeline = createAudioPipeline(video) ?? undefined
  if (!pipeline)
    return
  startNormalizer(pipeline, video)
  resumeAudioPipeline(video)
}

function collectionScore(element: HTMLElement, linkCount: number): number {
  const classes = `${element.id} ${element.className}`.toLowerCase()
  const hintScore = collectionHints.reduce((score, hint) => score + (classes.includes(hint) ? 20 : 0), 0)
  const scrollScore = element.scrollHeight > element.clientHeight + 16 ? 20 : 0
  return hintScore + scrollScore - linkCount * 0.08
}

function uniqueVideoLinks(container: HTMLElement): HTMLAnchorElement[] {
  const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"], a[href*="?p="]'))
  const seen = new Set<string>()
  return links.filter((link) => {
    const target = videoTarget(link.href)
    if (!target || seen.has(target))
      return false
    seen.add(target)
    return true
  })
}

function detectCollection(): CollectionContext | null {
  const currentTarget = videoTarget()
  if (!currentTarget)
    return null

  const matchingAnchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"], a[href*="?p="]'))
    .filter(link => videoTarget(link.href) === currentTarget)
  let best: { container: HTMLElement, links: HTMLAnchorElement[], score: number } | null = null

  for (const anchor of matchingAnchors) {
    let node: HTMLElement | null = anchor.parentElement
    for (let depth = 0; node && depth < 9; depth++, node = node.parentElement) {
      const links = uniqueVideoLinks(node)
      if (links.length < 2 || links.length > 200)
        continue
      const score = collectionScore(node, links.length) - depth * 0.6
      if (!best || score > best.score)
        best = { container: node, links, score }
    }
  }

  if (!best)
    return null
  const targets = best.links.map(link => videoTarget(link.href)!).filter(Boolean)
  const currentIndex = targets.indexOf(currentTarget)
  if (currentIndex < 0)
    return null
  const signature = `${targets.length}|${targets[0]}|${targets.at(-1)}`
  return {
    container: best.container,
    links: best.links,
    targets,
    currentIndex,
    currentTarget,
    key: hashText(signature),
  }
}

async function restoreCollectionProgress(video: HTMLVideoElement, context: CollectionContext) {
  if (video.readyState < 1 || !Number.isFinite(video.duration) || video.duration <= 0)
    return
  if (video.currentTime > 4)
    return
  const key = storageProgressKey(context.currentTarget)
  const stored = await browser.storage.local.get(key)
  const progress = stored[key] as StoredProgress | undefined
  if (!progress || progress.time < 5 || progress.time > video.duration - 10)
    return
  video.currentTime = progress.time
}

async function saveProgress(video: HTMLVideoElement, context: CollectionContext) {
  if (!Number.isFinite(video.currentTime) || video.currentTime < 1)
    return
  const now = Date.now()
  if (now - lastProgressWrite < 4000)
    return
  lastProgressWrite = now
  const progress: StoredProgress = {
    time: video.currentTime,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    updatedAt: now,
  }
  await browser.storage.local.set({ [storageProgressKey(context.currentTarget)]: progress })
}

async function rememberCollectionPosition(context: CollectionContext) {
  const now = Date.now()
  if (now - lastCollectionWrite < 1500)
    return
  lastCollectionWrite = now
  const state: StoredCollectionState = { target: context.currentTarget, updatedAt: now }
  await browser.storage.local.set({ [storageCollectionKey(context.key)]: state })
}

async function maybeResumeCollection(context: CollectionContext) {
  const token = ++collectionCheckToken
  const manualTarget = sessionStorage.getItem(MANUAL_NAV_KEY)
  if (manualTarget === context.currentTarget) {
    sessionStorage.removeItem(MANUAL_NAV_KEY)
    await rememberCollectionPosition(context)
    return
  }
  if (context.currentIndex !== 0) {
    await rememberCollectionPosition(context)
    return
  }

  const key = storageCollectionKey(context.key)
  const stored = await browser.storage.local.get(key)
  if (token !== collectionCheckToken)
    return
  const state = stored[key] as StoredCollectionState | undefined
  if (state?.target && state.target !== context.currentTarget && context.targets.includes(state.target)) {
    const destination = context.links[context.targets.indexOf(state.target)]?.href
    if (destination) {
      sessionStorage.setItem(MANUAL_NAV_KEY, state.target)
      location.href = destination
      return
    }
  }
  await rememberCollectionPosition(context)
}

function onCollectionLinkClick(event: MouseEvent) {
  if (!activeCollection)
    return
  const target = event.target
  if (!(target instanceof Element))
    return
  const anchor = target.closest<HTMLAnchorElement>('a[href*="/video/"], a[href*="?p="]')
  if (!anchor || !activeCollection.container.contains(anchor))
    return
  const normalized = videoTarget(anchor.href)
  if (normalized)
    sessionStorage.setItem(MANUAL_NAV_KEY, normalized)
}

async function bindVideo(video: HTMLVideoElement) {
  if (video === activeVideo)
    return
  videoCleanup?.()
  activeVideo = video

  const onRateChange = () => void savePlaybackSpeed(video)
  const onMetadata = () => {
    void restorePlaybackSpeed(video)
    if (activeCollection)
      void restoreCollectionProgress(video, activeCollection)
  }
  const onPlaying = () => {
    void restorePlaybackSpeed(video)
    updateAudioPipeline(video)
    resumeAudioPipeline(video)
  }
  const onTimeUpdate = () => {
    if (activeCollection)
      void saveProgress(video, activeCollection)
  }

  video.addEventListener('ratechange', onRateChange)
  video.addEventListener('loadedmetadata', onMetadata)
  video.addEventListener('playing', onPlaying)
  video.addEventListener('timeupdate', onTimeUpdate)
  videoCleanup = () => {
    video.removeEventListener('ratechange', onRateChange)
    video.removeEventListener('loadedmetadata', onMetadata)
    video.removeEventListener('playing', onPlaying)
    video.removeEventListener('timeupdate', onTimeUpdate)
    disposeAudioPipeline(video)
  }

  await restorePlaybackSpeed(video)
  updateAudioPipeline(video)
  if (activeCollection)
    await restoreCollectionProgress(video, activeCollection)
}

async function syncEnhancements() {
  hideWatchAds()
  ensureFallbackSettingsButton()

  const video = findVideo()
  if (video)
    await bindVideo(video)

  const currentLocationKey = `${location.pathname}${location.search}`
  if (currentLocationKey !== locationKey) {
    locationKey = currentLocationKey
    activeCollection = null
    collectionCheckToken++
  }

  const collection = detectCollection()
  if (!collection)
    return
  const collectionChanged = !activeCollection
    || activeCollection.key !== collection.key
    || activeCollection.currentTarget !== collection.currentTarget
  activeCollection = collection
  if (collectionChanged) {
    await maybeResumeCollection(collection)
    if (video)
      await restoreCollectionProgress(video, collection)
  }
}

export default defineContentScript({
  matches: ['https://www.bilibili.com/video/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',
  async main(ctx) {
    await loadSettings()

    const start = () => {
      if (!document.body) {
        requestAnimationFrame(start)
        return
      }
      void syncEnhancements()
    }
    start()

    const observer = new MutationObserver(() => {
      if (mutationScheduled)
        return
      mutationScheduled = true
      requestAnimationFrame(() => {
        mutationScheduled = false
        void syncEnhancements()
      })
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })

    const locationTimer = window.setInterval(() => void syncEnhancements(), 800)
    document.addEventListener('click', onCollectionLinkClick, true)
    const onUserPointerDown = (event: PointerEvent) => {
      lastUserInteractionAt = performance.now()
      if (activeVideo) {
        updateAudioPipeline(activeVideo)
        resumeAudioPipeline(activeVideo)
      }
      const target = event.target
      if (!(target instanceof Node))
        return
      if (settingsPanel?.contains(target) || fallbackSettingsButton?.contains(target))
        return
      closeFloatingSettings(true)
    }
    const onUserKeyDown = () => {
      lastUserInteractionAt = performance.now()
      if (activeVideo) {
        updateAudioPipeline(activeVideo)
        resumeAudioPipeline(activeVideo)
      }
    }
    document.addEventListener('pointerdown', onUserPointerDown, true)
    document.addEventListener('keydown', onUserKeyDown, true)

    ctx.onInvalidated(() => {
      observer.disconnect()
      window.clearInterval(locationTimer)
      document.removeEventListener('click', onCollectionLinkClick, true)
      document.removeEventListener('pointerdown', onUserPointerDown, true)
      document.removeEventListener('keydown', onUserKeyDown, true)
      cancelSettingsClose()
      videoCleanup?.()
      videoCleanup = null
      activeVideo = null
      settingsPanel?.remove()
      fallbackSettingsButton?.remove()
      settingsPanel = null
      fallbackSettingsButton = null
      settingsPinned = false
    })
  },
})
