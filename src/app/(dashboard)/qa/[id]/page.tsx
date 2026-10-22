export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentEmployee, getRealEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { Card, CardContent } from '@/components/ui/card'
import { CertRingAvatar } from '@/components/ui/cert-ring-avatar'
import { MemberNameLink } from '@/components/layout/member-name-link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { QaStatusBadge } from '@/components/qa/status-badge'
import { AnswerForm } from '@/components/qa/answer-form'
import { canModerateQa, canResolveQuestion, type QaAnswerRow, type QaQuestionRow } from '@/lib/qa'
import { getQaModeratorIds } from '@/lib/settings'
import { QaModerateButton } from '@/components/qa/moderate-button'

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function BackLink() {
  return (
    <Link href="/qa" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
      <ChevronLeft className="w-4 h-4" />Q&amp;A 一覧に戻る
    </Link>
  )
}

export default async function QaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getCurrentEmployee()
  if (!me) redirect('/login')

  const db = createAdminClient()
  const [{ data: qData }, { data: aData }, moderatorIds] = await Promise.all([
    db.from('qa_questions').select('*').eq('id', id).maybeSingle(),
    db.from('qa_answers').select('*').eq('question_id', id).order('created_at', { ascending: true }),
    getQaModeratorIds(),
  ])
  // 非表示にできるかは本人で判定する（view-as で非表示にできる人になりすまして中身を読めないように）
  const real = await getRealEmployee()
  const canModerate = !!real && canModerateQa(real, moderatorIds)
  // 非表示の質問・回答は、非表示にできる人にだけ見せる（ほかの人には「見つかりませんでした」）
  const q = qData && (canModerate || !(qData as QaQuestionRow).hidden_at) ? (qData as QaQuestionRow) : null
  const answers = ((aData ?? []) as QaAnswerRow[]).filter(a => canModerate || !a.hidden_at)

  if (!q) {
    return (
      <>
        <TopBar title="Q&A" />
        <div className="px-4 py-10 max-w-md mx-auto text-center space-y-4">
          <p className="text-base font-bold text-gray-800">見つかりませんでした</p>
          <p className="text-sm text-gray-500">この質問は削除されたか、URLが正しくない可能性があります。</p>
          <BackLink />
        </div>
      </>
    )
  }

  const ids = [...new Set([q.asker_id, ...answers.map(a => a.author_id), ...(q.resolved_by ? [q.resolved_by] : [])])]
  const { data: emps } = await db.from('employees').select('id, name, avatar_url').in('id', ids)
  const empMap = Object.fromEntries((emps ?? []).map(e => [e.id, e]))
  const asker = empMap[q.asker_id]

  const questionCard = (
    <Card>
      <CardContent className="py-4 px-4 space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <QaStatusBadge status={q.status} />
          {q.status === 'resolved' && q.resolved_at && (
            <span className="text-[11px] text-gray-400">{fmtDateTime(q.resolved_at)}{q.resolved_by && empMap[q.resolved_by] ? `（${empMap[q.resolved_by].name}）` : ''}</span>
          )}
        </div>
        <h1 className="text-base font-bold text-gray-800 leading-snug">{q.title}</h1>
        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{q.body}</p>
        <div className="flex items-center gap-2 pt-1">
          <CertRingAvatar employeeId={q.asker_id} src={asker?.avatar_url} name={asker?.name} size={28} fallbackClassName="bg-sky-100 text-sky-700" />
          <MemberNameLink employeeId={q.asker_id} className="text-xs text-gray-600">{asker?.name ?? '不明'}</MemberNameLink>
          <span className="text-[11px] text-gray-400">{fmtDateTime(q.created_at)}</span>
          {canModerate && !q.hidden_at && <span className="ml-auto"><QaModerateButton questionId={q.id} hidden={false} label="質問" /></span>}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <>
      <TopBar title="Q&A" />
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <BackLink />

        {q.hidden_at && (
          <div className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-xs text-gray-700 flex items-center justify-between gap-2">
            <span>この質問は非表示中です（非表示にできる方にだけ見えています）</span>
            <QaModerateButton questionId={q.id} hidden label="質問" />
          </div>
        )}

        {/* 質問（非表示中は、開かない限り中身を出さない） */}
        {q.hidden_at ? (
          <details className="group rounded-lg border border-gray-200 bg-gray-50">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs text-gray-600 flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
              非表示にした質問を開く
            </summary>
            <div className="px-2 pb-2 opacity-70">{questionCard}</div>
          </details>
        ) : questionCard}

        {/* 回答 */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 px-1">回答 {answers.filter(a => !a.hidden_at).length > 0 && <span className="text-gray-400 font-normal">{answers.filter(a => !a.hidden_at).length}件</span>}</h2>
          {answers.length === 0 ? (
            <p className="text-sm text-gray-400 px-1">まだ回答はありません。分かる人は、下から回答をお願いします。</p>
          ) : (
            answers.map(a => {
              const emp = empMap[a.author_id]
              const card = (
                <Card key={a.id} className={a.hidden_at ? 'bg-gray-50' : undefined}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <CertRingAvatar employeeId={a.author_id} src={emp?.avatar_url} name={emp?.name} size={32} className="flex-shrink-0 mt-0.5" fallbackClassName="bg-emerald-100 text-emerald-700" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <MemberNameLink employeeId={a.author_id} className="text-xs font-medium text-gray-700">{emp?.name ?? '不明'}</MemberNameLink>
                          <span className="text-[11px] text-gray-400">{fmtDateTime(a.created_at)}</span>
                          {a.hidden_at && <span className="text-[10px] text-gray-600 bg-gray-200 rounded px-1.5 py-0.5">非表示中</span>}
                          {canModerate && <span className="ml-auto"><QaModerateButton questionId={q.id} answerId={a.id} hidden={!!a.hidden_at} label="回答" /></span>}
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mt-1">{a.body}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
              // 非表示にした回答は、開かない限り中身を出さない
              return a.hidden_at ? (
                <details key={a.id} className="group rounded-lg border border-gray-200 bg-gray-50">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs text-gray-600 flex items-center gap-1.5">
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                    非表示にした回答を開く
                  </summary>
                  <div className="px-2 pb-2 opacity-70">{card}</div>
                </details>
              ) : card
            })
          )}
        </section>

        {/* 非表示中の質問には回答できない（API も 404 を返す） */}
        {!q.hidden_at && <AnswerForm questionId={q.id} status={q.status} canResolve={canResolveQuestion(me, q)} />}
      </div>
    </>
  )
}
