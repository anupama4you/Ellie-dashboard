import BrandIcon, { type BrandIconName } from '@/components/BrandIcon'

type Props = {
  name: string
  description: string
  icon: BrandIconName
  color: string
  bg: string
}

/** UI-only placeholder for an integration with no backend yet — always shows "Coming soon" and a disabled Connect button. */
export default function IntegrationTile({ name, description, icon, color, bg }: Props) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3.5" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
      <div className="flex items-center justify-between">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
          <BrandIcon name={icon} size={18} color={color} />
        </span>
        <span className="text-[0.65rem] font-bold px-2 py-1 rounded-full whitespace-nowrap" style={{ background: 'var(--paper)', color: 'var(--ink-3)' }}>
          Coming soon
        </span>
      </div>
      <div>
        <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{name}</h3>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--ink-3)' }}>{description}</p>
      </div>
      <button
        disabled
        className="w-full mt-1 px-4 py-2 rounded-lg text-sm font-semibold cursor-not-allowed"
        style={{ border: '1px solid var(--line)', color: 'var(--ink-3)', background: 'var(--paper)' }}
      >
        Connect
      </button>
    </div>
  )
}
