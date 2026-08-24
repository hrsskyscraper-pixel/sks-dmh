export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { canAdminister } from '@/lib/permissions'
import { ChevronLeft, Mail, MessageSquare } from 'lucide-react'

const CATEGORY_LABEL: Record<string, string> = {
  join_request: '参加依頼',
  approval: '参加承認',
  invitation: 'チーム招待',
}

function fmt(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => n.toString().padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default async function NotificationLogPage() {
  const me = await getCurrentEmployee()
  if (!me || !canAdminister(me)) redirect('/')

  const db = createAdminClient()
  const { data: logs } = await db
    .from('notification_log')
    .select('id, category, channel, recipient, subject, status, error, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = logs ?? []
  const failed = rows.filter(r => r.status === 'failed')
  const skipped = rows.filter(r => r.status === 'skipped')

  return (
    <>
      <TopBar title="通知ログ" />
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Link href="/admin/settings" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="w-4 h-4" /> 設定に戻る
        </Link>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-600">
            直近の通知（メール・LINE）の送信結果です。
            <span className="font-bold text-gray-800"> 直近200件中 </span>
            のうち
            <span className={failed.length > 0 ? 'font-bold text-red-600' : 'font-bold text-emerald-600'}>
              {' '}失敗 {failed.length} 件
            </span>
            {skipped.length > 0 && (
              <span className="font-bold text-amber-600">／送信せず {skipped.length} 件</span>
            )}
            。失敗が続く場合は、宛先の設定やメール／LINEの上限をご確認ください。
            「送信せず」は、通知の休止設定や宛先未登録などで意図的に送らなかったものです。
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
            通知の記録はまだありません
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map(r => {
              const isFail = r.status === 'failed'
              const isSkipped = r.status === 'skipped'
              return (
                <div
                  key={r.id}
                  className={`rounded-lg border px-3 py-2.5 ${isFail ? 'border-red-200 bg-red-50' : isSkipped ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'}`}
                >
                  <div className="flex items-center gap-2">
                    {r.channel === 'line' ? (
                      <MessageSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-gray-700">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </span>
                    <span
                      className={`text-[10px] rounded-full px-2 py-0.5 ${isFail ? 'bg-red-100 text-red-700' : isSkipped ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}
                    >
                      {isFail ? '失敗' : isSkipped ? '送信せず' : '成功'}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{fmt(r.created_at)}</span>
                  </div>
                  {r.subject && <p className="text-xs text-gray-600 truncate mt-1">{r.subject}</p>}
                  <p className="text-[10px] text-gray-400 truncate mt-0.5">宛先: {r.recipient}</p>
                  {isFail && r.error && <p className="text-[10px] text-red-500 break-all mt-0.5">{r.error}</p>}
                  {isSkipped && r.error && <p className="text-[10px] text-amber-600 break-all mt-0.5">{r.error}</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
