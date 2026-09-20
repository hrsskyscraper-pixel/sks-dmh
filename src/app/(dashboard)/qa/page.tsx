export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { Card, CardContent } from '@/components/ui/card'
import { CertRingAvatar } from '@/components/ui/cert-ring-avatar'
import { ChevronRight, Inbox, MessageSquare } from 'lucide-react'
import { NewQuestionDialog } from '@/components/qa/new-question-dialog'
import { QaStatusBadge } from '@/components/qa/status-badge'
import type { QaQuestionRow } from '@/lib/qa'

const SELECT = 'id, asker_id, title, body, status, answer_count, resolved_at, resolved_by, created_at, updated_at'
const fmtDate = (d: string) => new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-10 text-gray-400 border border-dashed border-gray-200 rounded-xl">
      <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <p className="text-sm px-4">{text}</p>
    </div>
  )
}

/**
 * Q&A 一覧（2026-09-19 MTG 決定 ④: 改善提案の上に置く。誰でも質問・回答・閲覧できる）
 * 上から「回答待ち」「回答あり・解決済み」。自分の質問には印を付ける。
 */
export default async function QaPage() {
  const me = await getCurrentEmployee()
  if (!me) redirect('/login')

  const db = createAdminClient()
  const { data } = await db.from('qa_questions').select(SELECT).order('created_at', { ascending: false }).limit(300)
  const questions = (data ?? []) as QaQuestionRow[]

  const askerIds = [...new Set(questions.map(q => q.asker_id))]
  const { data: emps } = askerIds.length > 0
    ? await db.from('employees').select('id, name, avatar_url').in('id', askerIds)
    : { data: [] as { id: string; name: string; avatar_url: string | null }[] }
  const empMap = Object.fromEntries((emps ?? []).map(e => [e.id, e]))

  const waiting = questions.filter(q => q.status === 'open' && q.answer_count === 0)
  const others = questions.filter(q => !(q.status === 'open' && q.answer_count === 0))

  const Row = ({ q }: { q: QaQuestionRow }) => {
    const emp = empMap[q.asker_id]
    const mine = q.asker_id === me.id
    return (
      <Link href={`/qa/${q.id}`} className="block">
        <Card className={q.status === 'open' && q.answer_count === 0 ? 'border-amber-200 bg-amber-50/40 hover:bg-amber-50 transition-colors' : 'hover:bg-gray-50 transition-colors'}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <CertRingAvatar employeeId={q.asker_id} src={emp?.avatar_url} name={emp?.name} size={36} className="flex-shrink-0" fallbackClassName="bg-sky-100 text-sky-700" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <QaStatusBadge status={q.status} />
                  {mine && <span className="text-[10px] text-sky-700 bg-sky-100 rounded px-1.5 py-0.5">自分の質問</span>}
                </div>
                <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{q.title}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2">
                  <span>{emp?.name ?? '不明'} ・ {fmtDate(q.created_at)}</span>
                  <span className="inline-flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{q.answer_count}</span>
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  return (
    <>
      <TopBar title="Q&A" />
      <div className="p-4 max-w-lg mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">分からないことは、ここで聞けます。誰でも質問でき、誰でも回答できます</p>
          <NewQuestionDialog />
        </div>

        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <h2 className="text-sm font-semibold text-gray-700">回答待ち</h2>
            {waiting.length > 0 && <span className="text-[11px] font-bold text-white bg-amber-500 rounded-full px-2 py-0.5">{waiting.length}</span>}
          </div>
          {waiting.length === 0 ? <EmptyState text="回答待ちの質問はありません" /> : waiting.map(q => <Row key={q.id} q={q} />)}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 px-1">回答あり・解決済み</h2>
          {others.length === 0 ? <EmptyState text="まだ質問はありません。右上の「質問する」から投稿できます" /> : others.map(q => <Row key={q.id} q={q} />)}
        </section>

        <p className="text-xs text-gray-400 px-1">
          アプリへの要望や不具合は <Link href="/improvements" className="text-orange-600 hover:underline">改善提案</Link> へ。
        </p>
      </div>
    </>
  )
}
