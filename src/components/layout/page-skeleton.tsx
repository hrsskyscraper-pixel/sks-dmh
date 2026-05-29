// ページ遷移時に即表示するコンテンツ型スケルトン（サーバーコンポーネント）。
// レイアウトはバッジ取得を待たず即返るため、各ページの loading.tsx がすぐ表示される。

function Bar({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />
}

/** ヘッダー風のバー（TopBar の高さに合わせる） */
export function HeaderSkeleton() {
  return (
    <div className="sticky top-0 bg-white/80 border-b border-gray-100 z-40">
      <div className="flex items-center h-14 px-4 max-w-2xl mx-auto gap-2">
        <Bar className="h-5 w-32" />
        <div className="flex-1" />
        <Bar className="h-9 w-9 rounded-full" />
      </div>
    </div>
  )
}

/** カードが縦に並ぶ一覧ページ用のスケルトン */
export function ListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div>
      <HeaderSkeleton />
      <div className="p-4 space-y-3 max-w-2xl mx-auto">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
            <Bar className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Bar className="h-3.5 w-1/2" />
              <Bar className="h-3 w-1/3" />
            </div>
            <Bar className="h-7 w-16 rounded-md flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
