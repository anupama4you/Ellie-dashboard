'use client'

import { useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'

export default function PlayButton({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else audio.play()
  }

  return (
    <button
      onClick={toggle}
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        background: playing ? 'var(--violet)' : 'var(--card)',
        border: `1px solid ${playing ? 'var(--violet)' : 'var(--line)'}`,
        color: playing ? '#fff' : 'var(--ink-2)',
        outlineColor: 'var(--violet)',
      }}
      aria-label={playing ? 'Pause recording' : 'Play recording'}
      aria-pressed={playing}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      {playing
        ? <Pause size={12} fill="currentColor" />
        : <Play size={12} fill="currentColor" style={{ marginLeft: 1.5 }} />}
    </button>
  )
}
