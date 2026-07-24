export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { Card, CardContent } from '@/components/ui/card'
import { CertRingAvatar } from '@/components/ui/cert-ring-avatar'
import { ChevronRight, Inbox } from 'lucide-react'
import { CATEGORY_OPTIONS, getExecRoleId, isDevEmp, isExecEmp, isOpsEmp } from '@/lib/improvements'
import { NewRequestDialog } from '@/components/improvements/new-request-dialog'
import { ImprovementStatusBadge } from '@/components/improvements/status-badge'

type RequestRow = {
  id: string
  title: string
  category: string | null
  status: string
  requester_id: string
  created_at: string
  updated_at: string
}

const SELECT = 'id, title, category, status, requester_id, created_at, updated_at'

const fmtDate = (d: string) => new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-10 text-gray-400 border border-dashed border-gray-200 rounded-xl">
      <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <p className="text-sm px-4">{text}</p>
    </div>
  )
}

export default async function ImprovementsPage() {
  const me = await getCurrentEmployee()
  if (!me) redirect('/login')

  const db = createAdminClient()
  const execRoleId = await getExecRoleId()
  const isOps = isOpsEmp(me)
  const isExec = isExecEmp(me, execRoleId)
  const isDev = isDevEmp(me)
  const isManager = isOps || isExec || isDev

  // 自分の申請 + （運営/役員/開発者なら）全件の管理ビュー
  const [ownRes, allRes] = await Promise.all([
    db.from('improvement_requests').select(SELECT).eq('requester_id', me.id).order('created_at', { ascending: false }),
    isManager
      ? db.from('improvement_requests').select(SELECT).order('created_at', { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as RequestRow[] }),
  ])
  const own = (ownRes.data ?? []) as RequestRow[]
  const all = (allRes.data ?? []) as RequestRow[]

  // 申請者の氏名・アバターを別クエリで解決（FK宣言が無いため手動マッピング）
  const requesterIds = [...new Set([...own, ...all].map(r => r.requester_id))]
  const { data: emps } = requesterIds.length > 0
    ? await db.from('employees').select('id, name, avatar_url').in('id', requesterIds)
    : { data: [] as { id: string; name: string; avatar_url: string | null }[] }
  const empMap = Object.fromEntries((emps ?? []).map(e => [e.id, e]))

  // 自分の対応が必要な段階か（運営=申請中 / 役員=運営承認済 / 開発=役員承認済・開発中）
  const needsMyAction = (status: string) =>
    (isOps && status === 'submitted') ||
    (isExec && status === 'ops_approved') ||
    (isDev && (status === 'exec_approved' || status === 'in_development'))

  // 要対応を先頭へ（同グループ内は取得済みの新着順を維持）
  const managed = isManager
    ? [...all].sort((a, b) => (needsMyAction(b.status) ? 1 : 0) - (needsMyAction(a.status) ? 1 : 0))
    : []
  const actionCount = managed.filter(r => needsMyAction(r.status)).length

  return (
    <>
      <TopBar title="改善提案" />
      <div className="p-4 max-w-lg mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">アプリへのご要望や改善のアイデアを送れます</p>
          <NewRequestDialog categories={CATEGORY_OPTIONS} />
        </div>

        {/* 自分の申請 */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 px-1">自分の申請</h2>
          {own.length === 0 ? (
            <EmptyState text="まだ申請はありません。右上のボタンから送れます。" />
          ) : (
            own.map(r => (
              <Link key={r.id} href={`/improvements/${r.id}`} className="block">
                <Card className="hover:bg-gray-50 transition-colors">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ImprovementStatusBadge status={r.status} />
                          {r.category && <span className="text-[10px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{r.category}</span>}
                        </div>
                        <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{r.title}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">更新: {fmtDate(r.updated_at)}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </section>

        {/* 対応・確認（運営 / 役員 / 開発者） */}
        {isManager && (
          <section className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <h2 className="text-sm font-semibold text-gray-700">対応・確認</h2>
              {actionCount > 0 && (
                <span className="text-[11px] font-bold text-white bg-red-500 rounded-full px-2 py-0.5">要対応 {actionCount}</span>
              )}
            </div>
            {managed.length === 0 ? (
              <EmptyState text="対応・確認が必要な改善提案はありません。" />
            ) : (
              managed.map(r => {
                const emp = empMap[r.requester_id]
                const hot = needsMyAction(r.status)
                return (
                  <Link key={r.id} href={`/improvements/${r.id}`} className="block">
                    <Card className={hot ? 'border-red-200 bg-red-50/40 hover:bg-red-50 transition-colors' : 'hover:bg-gray-50 transition-colors'}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <CertRingAvatar employeeId={r.requester_id} src={emp?.avatar_url} name={emp?.name} size={36} className="flex-shrink-0" fallbackClassName="bg-orange-100 text-orange-700" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <ImprovementStatusBadge status={r.status} />
                              {r.category && <span className="text-[10px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{r.category}</span>}
                              {hot && <span className="text-[10px] font-bold text-red-600">要対応</span>}
                            </div>
                            <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{r.title}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{emp?.name ?? '不明'} ・ {fmtDate(r.updated_at)}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })
            )}
          </section>
        )}
      </div>
    </>
  )
}
