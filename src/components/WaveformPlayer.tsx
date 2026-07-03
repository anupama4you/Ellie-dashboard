'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Download } from 'lucide-react'

/** Deterministic pseudo-random bars seeded by URL, so the shape stays stable across re-renders */
function hashSeed(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return h >>> 0
}

function mulberry32(seed: number) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generateBars(seedStr: string, count: number): number[] {
  const rand = mulberry32(hashSeed(seedStr))
  const bars: number[] = []
  let prev = 0.5
  for (let i = 0; i < count; i++) {
    prev = Math.min(1, Math.max(0.16, prev + (rand() - 0.5) * 0.7))
    bars.push(prev)
  }
  return bars
}

function fmt(t: number) {
  if (!isFinite(t) || t < 0) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function WaveformPlayer({ src, compact }: { src: string; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const bars = useMemo(() => generateBars(src, compact ? 100 : 64), [src, compact])
  const [playing, setPlaying]         = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]       = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime    = () => setCurrentTime(audio.currentTime)
    const onLoaded  = () => setDuration(audio.duration)
    const onEnded   = () => setPlaying(false)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); setPlaying(false) }
    else { audio.play(); setPlaying(true) }
  }

  function seekTo(fraction: number) {
    const audio = audioRef.current
    if (!audio || !duration) return
    const t = fraction * duration
    audio.currentTime = t
    setCurrentTime(t)
  }

  function handleSeekClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    seekTo(fraction)
    if (!playing) togglePlay()
  }

  const progress = duration > 0 ? currentTime / duration : 0

  const playButton = (
    <button
      onClick={togglePlay}
      className={`rounded-full flex items-center justify-center shrink-0 transition-transform cursor-pointer active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 ${compact ? 'w-6 h-6' : 'w-9 h-9'}`}
      style={{ background: '#a78bfa', color: '#0d1117', outlineColor: '#a78bfa' }}
      aria-label={playing ? 'Pause recording' : 'Play recording'}
    >
      {playing
        ? <Pause size={compact ? 10 : 14} fill="currentColor" />
        : <Play  size={compact ? 10 : 14} fill="currentColor" style={{ marginLeft: compact ? 1 : 2 }} />}
    </button>
  )

  const waveform = (
    <div
      className={`flex items-center gap-[2px] cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-offset-2 rounded ${compact ? 'h-5' : 'flex-1 h-9'}`}
      onClick={handleSeekClick}
      role="slider"
      aria-label="Seek recording"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
      style={{ outlineColor: '#a78bfa' }}
      onKeyDown={e => {
        if (e.key === 'ArrowRight') seekTo(Math.min(1, progress + 0.05))
        if (e.key === 'ArrowLeft')  seekTo(Math.max(0, progress - 0.05))
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePlay() }
      }}
    >
      {bars.map((h, i) => {
        const played = i / bars.length < progress
        return (
          <div
            key={i}
            className="flex-1 rounded-full transition-colors"
            style={{
              height: `${h * 100}%`,
              minHeight: 2,
              background: played ? '#34d399' : 'var(--t5)',
            }}
          />
        )
      })}
    </div>
  )

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
        <audio ref={audioRef} src={src} preload="metadata" />
        {playButton}
        <div className="flex-1 min-w-0">{waveform}</div>
        <span className="text-[11px] font-mono tabular-nums shrink-0" style={{ color: 'var(--t5)', minWidth: 30 }}>
          {fmt(playing || currentTime > 0 ? currentTime : duration)}
        </span>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {playButton}
      {waveform}

      {/* Time */}
      <span
        className="text-xs font-mono tabular-nums shrink-0"
        style={{ color: 'var(--t4)', minWidth: 78, textAlign: 'right' }}
      >
        {fmt(currentTime)} / {fmt(duration)}
      </span>

      {/* Download */}
      <a
        href={src}
        download
        onClick={e => e.stopPropagation()}
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors btn-ghost focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--t3)', border: '1px solid var(--border)', outlineColor: 'var(--t3)' }}
        title="Download recording"
        aria-label="Download recording"
      >
        <Download size={13} />
      </a>
    </div>
  )
}
