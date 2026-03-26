export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      {/* TopBar skeleton */}
      <div className="h-10 bg-gray-100 rounded-lg" />

      {/* Main content skeleton */}
      <div className="space-y-3">
        <div className="h-24 bg-gray-100 rounded-xl" />
        <div className="h-40 bg-gray-100 rounded-xl" />
        <div className="h-32 bg-gray-100 rounded-xl" />
      </div>
    </div>
  )
}
