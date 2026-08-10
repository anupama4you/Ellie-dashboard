import CallDetailSkeleton from '@/components/CallDetailSkeleton'

function Sk({ w, h, r = 6 }: { w?: number | string; h?: number; r?: number }) {
  return (
    <div className="skeleton"
      style={{ width: w, height: h ?? 12, borderRadius: r, flexShrink: 0 }} />
  )
}

export default function CallDetailLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-5">
          <Sk w={100} h={13} r={4} />
          <CallDetailSkeleton />
        </div>
      </div>
    </div>
  )
}
