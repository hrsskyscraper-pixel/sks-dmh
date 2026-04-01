export default function RootLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-orange-500 animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700">Growth Driver</p>
        <p className="text-[10px] text-gray-400 mt-0.5">GAPから、次の一歩へ。</p>
      </div>
    </div>
  )
}
