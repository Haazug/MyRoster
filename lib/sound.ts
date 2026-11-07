'use client'

// One shared audio engine: background music, cabin noise (during the flight) and the ding / ding-dong.
// Everything goes through Web Audio, so volume also works on iPhone/iPad (where audio.volume is read-only).

export type Channel = 'music' | 'cabin'
export type Kind = 'ding' | 'dingdong' | 'jingle'
export type SoundState = { volume: number; muted: boolean; bed: Channel; playing: boolean; effectsMuted:boolean }

const SRC: Record<Channel, string> = { music: '/aviao_es-e-mu_sicas.mp3', cabin: '/cabin-noise.mp3' }
const BOOST: Record<Channel, number> = { music: 1, cabin: 1.1 }
const CHANNELS: Channel[] = ['music', 'cabin']
const CHIME_SRC: Record<Kind, string> = { ding: '/ding-single.mp3', dingdong: '/ding.mp3', jingle: '/jingle.mp3' }

let ctx: AudioContext | null = null
let unlocked = false
let volume = 0.05
let muted = true
let effectsMuted = false
let bed: Channel = 'music'
const els: Partial<Record<Channel, HTMLAudioElement>> = {}
const gains: Partial<Record<Channel, GainNode>> = {}
const listeners = new Set<(s: SoundState) => void>()
let snapshot: SoundState = { volume, muted, bed, playing: false, effectsMuted }

function emit() {
  const a = els[bed]
  snapshot = { volume, muted, bed, effectsMuted, playing: !!a && !a.paused && !muted }
  listeners.forEach((fn) => fn(snapshot))
}

export const getState = () => snapshot
export function subscribe(fn: (s: SoundState) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function connect(ch: Channel) {
  const a = els[ch]
  if (!ctx || !a || gains[ch]) return
  try {
    const g = ctx.createGain()
    g.gain.value = 0
    ctx.createMediaElementSource(a).connect(g)
    g.connect(ctx.destination)
    gains[ch] = g
    a.volume = 1
  } catch {}
}

function elFor(ch: Channel) {
  let a = els[ch]
  if (!a && typeof window !== 'undefined') {
    a = new Audio(SRC[ch])
    a.loop = true
    a.preload = 'auto'
    a.addEventListener('playing', emit)
    a.addEventListener('pause', emit)
    els[ch] = a
    connect(ch)
  }
  return a
}

const target = (ch: Channel) => (muted || bed !== ch ? 0 : Math.min(1, volume * BOOST[ch]))

function apply() {
  if (typeof window === 'undefined') return
  CHANNELS.forEach((ch) => {
    const t = target(ch)
    const a = t > 0 ? elFor(ch) : els[ch]
    if (!a) return
    const g = gains[ch]
    if (g && ctx) g.gain.setTargetAtTime(t, ctx.currentTime, 0.35)
    else a.volume = t
    if (t > 0) {
      if (a.paused) a.play().catch(() => {})
    } else {
      window.setTimeout(() => {
        if (target(ch) === 0) els[ch]?.pause()
      }, 1500)
    }
  })
  emit()
}

// ---- chimes: decoded once, silence at the start skipped, never overlapping ----
const buffers: Partial<Record<Kind, { buf: AudioBuffer; offset: number }>> = {}
const loading: Partial<Record<Kind, Promise<void>>> = {}
let current: { src: AudioBufferSourceNode; g: GainNode } | null = null

function loadChime(kind: Kind): Promise<void> {
  if (!ctx || buffers[kind]) return Promise.resolve()
  if (!loading[kind]) {
    loading[kind] = fetch(CHIME_SRC[kind])
      .then((r) => r.arrayBuffer())
      .then((ab) => ctx!.decodeAudioData(ab))
      .then((buf) => {
        const d = buf.getChannelData(0)
        let i = 0
        while (i < d.length && Math.abs(d[i]) < 0.02) i++
        buffers[kind] = { buf, offset: Math.max(0, i / buf.sampleRate - 0.01) }
      })
      .catch(() => {
        delete loading[kind]
      })
  }
  return loading[kind]!
}

export async function play(kind: Kind) {
  if(!effectsMuted) unlock(true)
  if (typeof window === 'undefined' || effectsMuted || !ctx) return
  const c = ctx
  await loadChime(kind)
  const b = buffers[kind]
  if (!b || effectsMuted) return
  if (current) {
    const old = current
    current = null
    try {
      old.g.gain.cancelScheduledValues(c.currentTime)
      old.g.gain.setTargetAtTime(0, c.currentTime, 0.015)
      old.src.stop(c.currentTime + 0.08)
    } catch {}
  }
  const src = c.createBufferSource()
  src.buffer = b.buf
  const g = c.createGain()
  g.gain.value = kind === 'jingle' ? 0.4 : 0.7
  src.connect(g)
  g.connect(c.destination)
  src.onended = () => {
    if (current?.src === src) current = null
  }
  current = { src, g }
  src.start(0, b.offset)
}
export const ding = () => play('dingdong')

// call inside a click/touch handler (browsers only allow sound after a gesture)
export function unlock(background = false) {
  if (typeof window === 'undefined') return
  if (!background && muted) return
  if (!unlocked) {
    unlocked = true
    try {
      try { const session=(navigator as any).audioSession; if(session)session.type='ambient' } catch {}
      const AC = window.AudioContext || (window as any).webkitAudioContext
      ctx = new AC()
    } catch {
      ctx = null
    }
    CHANNELS.forEach(connect)
    loadChime('ding')
    loadChime('dingdong')
    loadChime('jingle')
  }
  ctx?.resume().catch(() => {})
  apply()
}

export const start = () => apply()
export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, v))
  apply()
}
export function setEffectsMuted(m:boolean) { effectsMuted=m; emit() }
export function setMuted(m: boolean) {
  muted = m
  apply()
}
export function setBed(ch: Channel) {
  if (bed === ch) return
  bed = ch
  apply()
}

// leaving the site (other tab, other app, closing): everything stops; coming back resumes it
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      CHANNELS.forEach((ch) => els[ch]?.pause())
      ctx?.suspend().catch(() => {})
    } else if (unlocked) {
      ctx?.resume().catch(() => {})
      apply()
    }
  })
  window.addEventListener('pagehide', () => CHANNELS.forEach((ch) => els[ch]?.pause()))
}

// iOS/iPadOS: after an interruption the context stays suspended until the next touch; wake it then
if (typeof document !== 'undefined') {
  const wake = () => {
    if (unlocked && ctx && (ctx.state as string) !== 'running') {
      ctx.resume().catch(() => {})
      apply()
    }
  }
  document.addEventListener('pointerdown', wake, { passive: true })
  document.addEventListener('touchend', wake, { passive: true })
}
