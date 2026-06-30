'use client'

import { useRef, useState, useEffect } from 'react'
import { Play, Pause, Volume2 } from 'lucide-react'

function fmt(secs: number) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function AudioPlayer({ src }: { src: string }) {
  const audioRef  = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying]   = useState(false)
  const [current, setCurrent]   = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTime  = () => setCurrent(el.currentTime)
    const onLoad  = () => setDuration(el.duration)
    const onEnd   = () => setPlaying(false)
    el.addEventListener('timeupdate',  onTime)
    el.addEventListener('loadedmetadata', onLoad)
    el.addEventListener('ended',       onEnd)
    return () => {
      el.removeEventListener('timeupdate',     onTime)
      el.removeEventListener('loadedmetadata', onLoad)
      el.removeEventListener('ended',          onEnd)
    }
  }, [])

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (playing) { el.pause(); setPlaying(false) }
    else         { el.play();  setPlaying(true)  }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = audioRef.current
    if (!el) return
    el.currentTime = Number(e.target.value)
    setCurrent(el.currentTime)
  }

  const pct = duration > 0 ? (current / duration) * 100 : 0

  return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-3 w-full"
      style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play / Pause */}
      <button onClick={toggle}
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-opacity hover:opacity-80"
        style={{ background: 'linear-gradient(135deg,#a78bfa,#f472b6)' }}>
        {playing
          ? <Pause  size={13} fill="white" style={{ color: 'white' }} />
          : <Play   size={13} fill="white" style={{ color: 'white', marginLeft: 1 }} />}
      </button>

      {/* Progress */}
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="relative h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#a78bfa,#f472b6)' }} />
          <input
            type="range" min={0} max={duration || 1} step={0.1}
            value={current} onChange={seek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        </div>
        <div className="flex justify-between text-xs tabular-nums" style={{ color: '#475569' }}>
          <span>{fmt(current)}</span>
          <span>{duration > 0 ? fmt(duration) : '—'}</span>
        </div>
      </div>

      <Volume2 size={13} style={{ color: '#475569' }} className="shrink-0" />
    </div>
  )
}
