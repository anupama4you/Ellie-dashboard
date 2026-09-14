export default function Loading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 sm:p-6 max-w-[1220px] mx-auto animate-pulse">
        <div className="h-8 w-48 rounded-lg mb-6" style={{ background: 'var(--bg3)' }} />
        <div className="h-40 rounded-2xl" style={{ background: 'var(--bg3)' }} />
      </div>
    </div>
  )
}
