import TabNav from '@/components/TabNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <TabNav />
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
