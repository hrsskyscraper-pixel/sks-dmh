export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { Card, CardContent } from '@/components/ui/card'
import { CertRingAvatar } from '@/components/ui/cert-ring-avatar'
import { ChevronLeft } from 'lucide-react'
import { getExecRoleId, isDevEmp, isExecEmp, isOpsEmp } from '@/lib/improvements'
import { ImprovementStatusBadge } from '@/components/improvements/status-badge'
import { RequestActions } from '@/components/improvements/request-actions'

// イベント種別 → 日本語ラベル
const EVENT_LABEL: Record<string, string> = {
  submitted: '申請',
  ops_approved: '運営承認・改善案提案',
  ops_rejected: '運営却下',
  exec_approved: '役員承認',
  exec_rejected: '役員却下',
  dev_started: '開発着手',
  completed: '完了',
}

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function BackLink() {
  return (
    <Link href="/improvements" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
      <ChevronLeft className="w-4 h-4" />改善提案一覧に戻る
    </Link>
  )
}

export default async function ImprovementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getCurrentEmployee()
  if (!me) redirect('/login')

  const db = createAdminClient()
  const execRoleId = await getExecRoleId()
  const isOps = isOpsEmp(me)
  const isExec = isExecEmp(me, execRoleId)
  const isDev = isDevEmp(me)

  const { data: req } = await db.from('improvement_requests').select('*').eq('id', id).maybeSingle()

  if (!req) {
    return (
      <>
        <TopBar title="改善提案" />
        <div className="px-4 py-10 max-w-md mx-auto text-center space-y-4">
          <p className="text-base font-bold text-gray-800">見つかりませんでした</p>
          <p className="text-sm text-gray-500">この改善提案は削除されたか、URLが正しくない可能性があります。</p>
          <BackLink />
        </div>
      </>
    )
  }

  // 申請者本人、または運営/役員/開発者のみ閲覧可能
  const canView = req.requester_id === me.id || isOps || isExec || isDev
  if (!canView) {
    return (
      <>
        <TopBar title="改善提案" />
        <div className="px-4 py-10 max-w-md mx-auto text-center space-y-4">
          <p className="text-base font-bold text-gray-800">権限がありません</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            この改善提案を閲覧する権限がありません。
            <br />
            ご自身が申請したもの、または運営・役員・開発者のみ閲覧できます。
          </p>
          <BackLink />
        </div>
      </>
    )
  }

  const { data: eventRows } = await db
    .from('improvement_request_events')
    .select('id, actor_id, type, comment, created_at')
    .eq('request_id', id)
    .order('created_at', { ascending: true })
  const events = eventRows ?? []

  // 申請者・各操作者の氏名/アバターを解決
  const personIds = [...new Set([req.requester_id, ...events.map(e => e.actor_id)].filter((v): v is string => !!v))]
  const { data: emps } = personIds.length > 0
    ? await db.from('employees').select('id, name, avatar_url').in('id', personIds)
    : { data: [] as { id: string; name: string; avatar_url: string | null }[] }
  const empMap = Object.fromEntries((emps ?? []).map(e => [e.id, e]))
  const requester = empMap[req.requester_id]

  return (
    <>
      <TopBar title="改善提案" />
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <BackLink />

        {/* 概要 */}
        <Card>
          <CardContent className="py-4 px-4 space-y-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <ImprovementStatusBadge status={req.status} />
              {req.category && <span className="text-[10px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{req.category}</span>}
            </div>
            <h1 className="text-lg font-bold text-gray-900">{req.title}</h1>
            <div className="flex items-center gap-2">
              <CertRingAvatar employeeId={req.requester_id} src={requester?.avatar_url} name={requester?.name} size={28} fallbackClassName="bg-orange-100 text-orange-700" />
              <span className="text-xs text-gray-500">{requester?.name ?? '不明'} が申請 ・ {fmtDateTime(req.created_at)}</span>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap border-t border-gray-100 pt-3">{req.description}</div>
          </CardContent>
        </Card>

        {/* 改善案 */}
        {req.ops_proposal && (
          <Card className="border-blue-100 bg-blue-50/40">
            <CardContent className="py-3 px-4 space-y-1">
              <p className="text-xs font-semibold text-blue-700">運営からの改善案</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.ops_proposal}</p>
            </CardContent>
          </Card>
        )}

        {/* 却下理由 */}
        {req.status === 'rejected' && req.reject_reason && (
          <Card className="border-red-100 bg-red-50/40">
            <CardContent className="py-3 px-4 space-y-1">
              <p className="text-xs font-semibold text-red-600">
                却下理由{req.reject_stage === 'exec' ? '（役員）' : req.reject_stage === 'ops' ? '（運営）' : ''}
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.reject_reason}</p>
            </CardContent>
          </Card>
        )}

        {/* 完了報告 */}
        {req.status === 'completed' && req.completion_note && (
          <Card className="border-emerald-100 bg-emerald-50/40">
            <CardContent className="py-3 px-4 space-y-1">
              <p className="text-xs font-semibold text-emerald-700">完了報告</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.completion_note}</p>
            </CardContent>
          </Card>
        )}

        {/* 段階に応じた操作 */}
        <RequestActions requestId={req.id} status={req.status} flags={{ isOps, isExec, isDev }} />

        {/* 経過（タイムライン） */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 px-1">経過</h2>
          {events.length === 0 ? (
            <p className="text-sm text-gray-400 px-1">まだ経過はありません。</p>
          ) : (
            <div className="space-y-2">
              {events.map(ev => {
                const actor = ev.actor_id ? empMap[ev.actor_id] : null
                return (
                  <div key={ev.id} className="flex gap-3">
                    <CertRingAvatar employeeId={ev.actor_id} src={actor?.avatar_url} name={actor?.name} size={30} className="flex-shrink-0 mt-0.5" fallbackClassName="bg-gray-100 text-gray-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700">{EVENT_LABEL[ev.type] ?? ev.type}</span>
                        <span className="text-[11px] text-gray-400">{actor?.name ?? 'システム'}</span>
                        <span className="text-[11px] text-gray-400">{fmtDateTime(ev.created_at)}</span>
                      </div>
                      {ev.comment && <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{ev.comment}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
