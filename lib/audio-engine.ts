/**
 * Lightweight audio engine using the native Web Audio API.
 * Zero dependencies, works in all modern browsers.
 */

export interface SoundSpec {
  id: string
  name: string
  /** Base64 data URL of the audio */
  dataUrl: string
  /** Volume 0-1 */
  volume: number
  /** Whether to loop */
  loop: boolean
}

type LoadedBuffer = { buffer: AudioBuffer; spec: SoundSpec }
type ActiveNode = { gain: GainNode; sources: Set<AudioBufferSourceNode>; timer?: ReturnType<typeof setTimeout> }

/** Loops overlap their end and their start by this long, so the restart is not heard. */
const LOOP_CROSSFADE = 2
const FADE_STEPS = 64
// Equal-power curves: the overlap keeps the same loudness.
const FADE_IN = new Float32Array(FADE_STEPS).map((_, i) => Math.sin((i / (FADE_STEPS - 1)) * Math.PI / 2))
const FADE_OUT = new Float32Array(FADE_STEPS).map((_, i) => Math.cos((i / (FADE_STEPS - 1)) * Math.PI / 2))

export class AudioEngine {
  private ctx: AudioContext | null = null
  private loaded = new Map<string, LoadedBuffer>()
  private activeNodes = new Map<string, ActiveNode>()
  private masterGain: GainNode | null = null
  private _muted = false

  /** Get or create the shared AudioContext (must be after user gesture) */
  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      this.ctx = new Ctor()
      this.masterGain = this.ctx.createGain()
      this.masterGain.connect(this.ctx.destination)
      this.masterGain.gain.value = this._muted ? 0 : 1
    }
    // Resume if suspended (autoplay policy)
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  /** Resume after the browser's autoplay block (call from a user gesture). */
  resume(): void {
    if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {})
  }

  get muted(): boolean {
    return this._muted
  }

  set muted(v: boolean) {
    this._muted = v
    if (this.masterGain) {
      this.masterGain.gain.value = v ? 0 : 1
    }
  }

  /** Decode and cache a sound from a data URL */
  async loadSound(spec: SoundSpec): Promise<void> {
    if (this.loaded.has(spec.id)) return
    const ctx = this.ensureCtx()
    const response = await fetch(spec.dataUrl)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arrayBuffer)
    this.loaded.set(spec.id, { buffer, spec })
  }

  /** Play a loaded sound. Returns a unique play ID for stop/unload. */
  play(id: string, volume?: number): string | null {
    const entry = this.loaded.get(id)
    if (!entry) return null
    const ctx = this.ensureCtx()
    const gain = ctx.createGain()
    gain.gain.value = volume ?? entry.spec.volume ?? 1
    gain.connect(this.masterGain ?? ctx.destination)
    const playId = `${id}_${Date.now()}`
    const node: ActiveNode = { gain, sources: new Set() }
    this.activeNodes.set(playId, node)
    const { buffer } = entry
    const xf = entry.spec.loop ? Math.min(LOOP_CROSSFADE, buffer.duration / 4) : 0
    // A loop is a chain of copies, each one fading in while the previous one fades out.
    const startCopy = (at: number, fadeIn: boolean) => {
      const source = ctx.createBufferSource()
      const fade = ctx.createGain()
      source.buffer = buffer
      source.connect(fade)
      fade.connect(gain)
      if (fadeIn) fade.gain.setValueCurveAtTime(FADE_IN, at, xf)
      source.start(at)
      node.sources.add(source)
      source.onended = () => {
        node.sources.delete(source)
        if (!xf && !node.sources.size) this.activeNodes.delete(playId)
      }
      if (!xf) return
      const next = at + buffer.duration - xf
      fade.gain.setValueCurveAtTime(FADE_OUT, next, xf)
      // Schedule the next copy as this one begins: ~a whole loop of slack against timer throttling.
      node.timer = setTimeout(() => {
        if (this.activeNodes.get(playId) === node) startCopy(next, true)
      }, Math.max(0, (at - ctx.currentTime) * 1000))
    }
    startCopy(ctx.currentTime, false)
    return playId
  }

  /** Stop a specific sound by its play ID */
  stop(playId: string): void {
    const node = this.activeNodes.get(playId)
    if (!node) return
    clearTimeout(node.timer)
    for (const source of node.sources) {
      try { source.stop() } catch { /* already stopped */ }
    }
    this.activeNodes.delete(playId)
  }

  /** Stop all sounds */
  stopAll(): void {
    for (const [id] of this.activeNodes) {
      this.stop(id)
    }
  }

  /** Stop all sounds of a given type (by id prefix match) */
  stopCategory(prefix: string): void {
    for (const [id] of this.activeNodes) {
      if (id.startsWith(prefix)) this.stop(id)
    }
  }

  /** Fade out and stop */
  fadeOut(playId: string, durationMs: number = 500): Promise<void> {
    return new Promise((resolve) => {
      const node = this.activeNodes.get(playId)
      if (!node) { resolve(); return }
      const startTime = this.ctx?.currentTime ?? performance.now() / 1000
      node.gain.gain.setValueAtTime(node.gain.gain.value, startTime)
      node.gain.gain.linearRampToValueAtTime(0, startTime + durationMs / 1000)
      setTimeout(() => {
        this.stop(playId)
        resolve()
      }, durationMs)
    })
  }

  /** Check if a sound is loaded */
  isLoaded(id: string): boolean {
    return this.loaded.has(id)
  }

  /** Unload all cached buffers */
  dispose(): void {
    this.stopAll()
    this.loaded.clear()
    if (this.ctx) {
      this.ctx.close().catch(() => {})
      this.ctx = null
      this.masterGain = null
    }
  }
}

/** Singleton shared across the app */
let _instance: AudioEngine | null = null
export function getAudioEngine(): AudioEngine {
  if (!_instance) _instance = new AudioEngine()
  return _instance
}