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

interface AudioPipeline {
  context: AudioContext
  source: MediaElementAudioSourceNode
  analyser: AnalyserNode
  gain: GainNode
  compressor: DynamicsCompressorNode
  samples: Float32Array<ArrayBuffer>
  timer: number | null
  smoothedLevelDb: number | null
  gainDb: number
  normalized: boolean
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
let activeVideo: HTMLVideoElement | null = null
let videoCleanup: ((keepAudio?: boolean) => void) | null = null
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
  const stored = await browser.storage.local.get(SETTINGS_KEY)
  const value = stored[SETTINGS_KEY] as Partial<PlaybackSettings> | undefined
  settings = {
    rememberSpeed: value?.rememberSpeed ?? defaults.rememberSpeed,
    loudnessNormalization: value?.loudnessNormalization ?? defaults.loudnessNormalization,
  }
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
  if (enabled && activeVideo)
    await browser.storage.local.set({ [LAST_SPEED_KEY]: clamp(activeVideo.playbackRate, 0.25, 4) })
  await saveSettings()
  refreshSettingsPanel()
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
    '开启后持续锁定你上一次选择的倍速，播放器重建后也会恢复。',
    settings.rememberSpeed,
    value => void updateRememberSpeed(value),
  )
  speedRow.querySelector('input')?.setAttribute('data-byt-setting', 'speed')

  const loudnessRow = buildToggleRow(
    '响度均衡',
    '动态增益补偿并限制峰值，不修改播放器音量。',
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

function stopNormalizer(pipeline: AudioPipeline) {
  if (pipeline.timer !== null) {
    window.clearInterval(pipeline.timer)
    pipeline.timer = null
  }
}

function disconnectAudioGraph(pipeline: AudioPipeline) {
  try { pipeline.source.disconnect() } catch {}
  try { pipeline.analyser.disconnect() } catch {}
  try { pipeline.gain.disconnect() } catch {}
  try { pipeline.compressor.disconnect() } catch {}
}

function connectBypass(pipeline: AudioPipeline) {
  stopNormalizer(pipeline)
  disconnectAudioGraph(pipeline)
  pipeline.gainDb = 0
  pipeline.smoothedLevelDb = null
  pipeline.gain.gain.cancelScheduledValues(pipeline.context.currentTime)
  pipeline.gain.gain.value = 1
  pipeline.source.connect(pipeline.context.destination)
  pipeline.normalized = false
  if (pipeline.context.state === 'suspended')
    void pipeline.context.resume().catch(() => {})
}

function startNormalizer(pipeline: AudioPipeline, video: HTMLVideoElement) {
  if (pipeline.timer !== null)
    return

  const tick = () => {
    if (!settings.loudnessNormalization || !pipeline.normalized || video !== activeVideo || video.paused)
      return
    if (pipeline.context.state !== 'running')
      return

    pipeline.analyser.getFloatTimeDomainData(pipeline.samples)
    let squareSum = 0
    for (let index = 0; index < pipeline.samples.length; index++)
      squareSum += pipeline.samples[index]! * pipeline.samples[index]!
    const rms = Math.sqrt(squareSum / pipeline.samples.length)
    if (!Number.isFinite(rms) || rms < 0.0025)
      return

    const levelDb = 20 * Math.log10(Math.max(rms, 1e-6))
    if (levelDb < -52)
      return

    pipeline.smoothedLevelDb = pipeline.smoothedLevelDb === null
      ? levelDb
      : pipeline.smoothedLevelDb * 0.94 + levelDb * 0.06

    // This is actual audio-path gain normalization. It targets a stable
    // programme level and is followed by a fast peak compressor. Unlike the
    // previous implementation it never writes HTMLMediaElement.volume.
    const targetLevelDb = -18
    const desiredGainDb = clamp(targetLevelDb - pipeline.smoothedLevelDb, -12, 8)
    const attack = desiredGainDb < pipeline.gainDb ? 0.22 : 0.055
    pipeline.gainDb += (desiredGainDb - pipeline.gainDb) * attack

    const linearGain = 10 ** (pipeline.gainDb / 20)
    const timeConstant = desiredGainDb < pipeline.gainDb ? 0.06 : 0.45
    pipeline.gain.gain.setTargetAtTime(linearGain, pipeline.context.currentTime, timeConstant)
  }

  pipeline.timer = window.setInterval(tick, 200)
}

function connectNormalizer(pipeline: AudioPipeline, video: HTMLVideoElement) {
  disconnectAudioGraph(pipeline)
  pipeline.source.connect(pipeline.analyser)
  pipeline.analyser.connect(pipeline.gain)
  pipeline.gain.connect(pipeline.compressor)
  pipeline.compressor.connect(pipeline.context.destination)
  pipeline.normalized = true
  startNormalizer(pipeline, video)
  if (pipeline.context.state === 'suspended')
    void pipeline.context.resume().catch(() => {})
}

function createAudioPipeline(video: HTMLVideoElement): AudioPipeline | null {
  let context: AudioContext | null = null
  let source: MediaElementAudioSourceNode | null = null

  try {
    context = new AudioContext()
    source = context.createMediaElementSource(video)
    const analyser = context.createAnalyser()
    const gain = context.createGain()
    const compressor = context.createDynamicsCompressor()

    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.68
    gain.gain.value = 1
    compressor.threshold.value = -3
    compressor.knee.value = 3
    compressor.ratio.value = 16
    compressor.attack.value = 0.003
    compressor.release.value = 0.25

    const pipeline: AudioPipeline = {
      context,
      source,
      analyser,
      gain,
      compressor,
      samples: new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT)),
      timer: null,
      smoothedLevelDb: null,
      gainDb: 0,
      normalized: false,
    }

    audioPipelines.set(video, pipeline)
    if (settings.loudnessNormalization)
      connectNormalizer(pipeline, video)
    else
      connectBypass(pipeline)
    return pipeline
  }
  catch (error) {
    // If createMediaElementSource succeeded before another setup step failed,
    // reconnect it directly so the media element remains audible.
    if (context && source) {
      try {
        source.connect(context.destination)
        void context.resume().catch(() => {})
      }
      catch {}
    }
    else if (context) {
      void context.close().catch(() => {})
    }
    console.debug('[BiliYouTube] loudness normalization unavailable for this media element', error)
    return null
  }
}

function bypassAudioPipeline(video: HTMLVideoElement) {
  const pipeline = audioPipelines.get(video)
  if (pipeline)
    connectBypass(pipeline)
}

function disposeAudioPipeline(video: HTMLVideoElement) {
  const pipeline = audioPipelines.get(video)
  if (!pipeline)
    return

  stopNormalizer(pipeline)
  disconnectAudioGraph(pipeline)
  void pipeline.context.close().catch(() => {})
  audioPipelines.delete(video)
}

function resumeAudioPipeline(video: HTMLVideoElement) {
  const pipeline = audioPipelines.get(video)
  if (pipeline?.context.state === 'suspended')
    void pipeline.context.resume().catch(() => {})
}

function updateAudioPipeline(video: HTMLVideoElement) {
  let pipeline = audioPipelines.get(video)

  if (!settings.loudnessNormalization) {
    if (pipeline)
      connectBypass(pipeline)
    return
  }

  if (!pipeline && !video.paused)
    pipeline = createAudioPipeline(video) ?? undefined
  if (!pipeline)
    return
  if (!pipeline.normalized)
    connectNormalizer(pipeline, video)
  else
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
  videoCleanup?.(false)
  activeVideo = video

  const onMetadata = () => {
    if (activeCollection)
      void restoreCollectionProgress(video, activeCollection)
  }
  const onPlaying = () => {
    updateAudioPipeline(video)
    resumeAudioPipeline(video)
  }
  const onTimeUpdate = () => {
    if (activeCollection)
      void saveProgress(video, activeCollection)
  }

  video.addEventListener('loadedmetadata', onMetadata)
  video.addEventListener('playing', onPlaying)
  video.addEventListener('timeupdate', onTimeUpdate)
  videoCleanup = (keepAudio = false) => {
    video.removeEventListener('loadedmetadata', onMetadata)
    video.removeEventListener('playing', onPlaying)
    video.removeEventListener('timeupdate', onTimeUpdate)
    if (keepAudio)
      bypassAudioPipeline(video)
    else
      disposeAudioPipeline(video)
  }

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
      videoCleanup?.(true)
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
