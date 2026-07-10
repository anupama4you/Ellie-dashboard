export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

const AVATAR_PALETTE: { color: string; bg: string }[] = [
  { color: 'var(--violet)', bg: 'var(--violet-soft)' },
  { color: 'var(--signal)', bg: 'var(--signal-soft)' },
  { color: 'var(--amber)',  bg: 'var(--amber-soft)'  },
  { color: 'var(--coral)',  bg: 'var(--coral-soft)'  },
  { color: '#2563EB',       bg: '#DBEAFE'             },
  { color: '#DB2777',       bg: '#FCE7F3'             },
]

/** Deterministic per-name color so the same caller always gets the same avatar color across renders and pages. */
export function avatarColor(name: string): { color: string; bg: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}
