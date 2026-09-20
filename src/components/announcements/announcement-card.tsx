'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Heart, MessageCircle, Send, Trophy, Award, PartyPopper, Sunrise } from 'lucide-react'
import { CertRingAvatar } from '@/components/ui/cert-ring-avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { MemberNameLink } from '@/components/layout/member-name-link'
import type { AnnouncementItem, AnnouncementReaction, AnnouncementComment, DailyReportPayload } from '@/lib/announcements'

const HEART = '❤️'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'たった今'
  if (mins < 60) return `${mins}分前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}日前`
  return new Date(dateStr).toLocaleDateString('ja-JP')
}

interface Props {
  item: AnnouncementItem
  reactions: AnnouncementReaction[]
  comments: AnnouncementComment[]
  reactorNames: Record<string, string>
  reactorAvatars: Record<string, string | null>
  currentEmployeeId: string
}

/** お知らせ（級合格・ランキング・新メンバー歓迎）の1枚。♡＋コメント（タイムライン共通の反応）。 */
export function AnnouncementCard({ item, reactions: initReactions, comments: initComments, reactorNames, reactorAvatars, currentEmployeeId }: Props) {
  const supabase = createClient()
  const [reactions, setReactions] = useState(initReactions)
  const [comments, setComments] = useState(initComments)
  const [commentInput, setCommentInput] = useState('')
  const [showComments, setShowComments] = useState(false)
  const [isPending, startTransition] = useTransition()

  const reacted = reactions.some(r => r.employee_id === currentEmployeeId)
  const likeCount = reactions.length
  const likerNames = reactions.map(r => reactorNames[r.employee_id] ?? '不明').filter((n, i, a) => a.indexOf(n) === i)

  const isRanking = item.kind === 'ranking'
  const isWelcome = item.kind === 'welcome'
  const isDaily = item.kind === 'daily'
  const isPraise = item.kind === 'praise'

  const toggleLike = () => {
    startTransition(async () => {
      if (reacted) {
        // 旧🎉も含め本人の反応を解除（絵文字非依存）
        const { error } = await supabase.from('announcement_reactions').delete()
          .eq('announcement_id', item.id).eq('employee_id', currentEmployeeId)
        if (error) { toast.error('取り消しに失敗しました'); return }
        setReactions(prev => prev.filter(r => r.employee_id !== currentEmployeeId))
      } else {
        const { error } = await supabase.from('announcement_reactions').insert({ announcement_id: item.id, employee_id: currentEmployeeId, emoji: HEART })
        if (error) { toast.error('送信に失敗しました'); return }
        setReactions(prev => [...prev, { announcement_id: item.id, employee_id: currentEmployeeId }])
      }
    })
  }

  const addComment = () => {
    const content = commentInput.trim()
    if (!content) return
    startTransition(async () => {
      const { data, error } = await supabase.from('announcement_comments')
        .insert({ announcement_id: item.id, employee_id: currentEmployeeId, content })
        .select().single()
      if (error) { toast.error('コメントの投稿に失敗しました'); return }
      setComments(prev => [...prev, data])
      setCommentInput('')
    })
  }

  return (
    <div className={cn('rounded-lg px-3 py-2.5 border', isDaily ? 'bg-orange-50 border-orange-200' : isRanking ? 'bg-amber-50 border-amber-200' : isWelcome ? 'bg-emerald-50 border-emerald-200' : isPraise ? 'bg-sky-50 border-sky-200' : 'bg-rose-50/60 border-rose-100')}>
      <div className="flex items-start gap-2">
        {isDaily ? <Sunrise className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
          : isRanking ? <Trophy className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          : isWelcome ? <PartyPopper className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          : isPraise ? <MessageCircle className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5" />
          : <Award className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          {isDaily ? (
            <>
              {item.title && <p className="text-sm font-semibold text-orange-800">{item.title}</p>}
              {item.payload ? <DailyReportBody payload={item.payload} body={item.body} /> : (
                item.body && <p className="text-xs text-gray-700 whitespace-pre-line mt-0.5 leading-relaxed">{item.body}</p>
              )}
            </>
          ) : isRanking ? (
            <>
              {item.title && <p className="text-sm font-semibold text-amber-800">{item.title}</p>}
              {item.body && <p className="text-xs text-gray-700 whitespace-pre-line mt-0.5">{item.body}</p>}
              {item.period && (
                <Link href={`/ranking?month=${item.period}`} className="inline-block text-xs text-amber-700 font-semibold hover:underline mt-1">
                  全員のランキングを見る →
                </Link>
              )}
            </>
          ) : isPraise ? (
            <div className="flex items-start gap-2">
              <CertRingAvatar employeeId={item.subjectId} src={item.subjectAvatar} name={item.subjectName ?? '?'} size={28} className="flex-shrink-0 mt-0.5" fallbackClassName="bg-sky-100 text-sky-700" />
              <div className="min-w-0">
                <p className="text-xs text-gray-600">
                  <span className="font-semibold text-gray-800">{item.createdByName ?? 'リーダー'}</span> さんから
                  {item.subjectStore && <span className="text-gray-500"> {item.subjectStore}の</span>}{' '}
                  <MemberNameLink employeeId={item.subjectId} className="font-semibold text-gray-800">{item.subjectName}</MemberNameLink> さんへ
                  {item.title && <span className="text-gray-400">（{item.title}）</span>}
                </p>
                {item.body && <p className="text-sm text-sky-900 font-medium whitespace-pre-line mt-0.5">「{item.body}」</p>}
              </div>
            </div>
          ) : isWelcome ? (
            <div className="flex items-center gap-2">
              <CertRingAvatar employeeId={item.subjectId} src={item.subjectAvatar} name={item.subjectName ?? '?'} size={28} className="flex-shrink-0" fallbackClassName="bg-emerald-100 text-emerald-700" />
              <p className="text-sm text-gray-800">
                🎉 {item.subjectStore && <span className="text-gray-500">{item.subjectStore}の </span>}
                <MemberNameLink employeeId={item.subjectId} className="font-semibold">{item.subjectName}</MemberNameLink>
                <span> さんが仲間入りしました！</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-800">
              {item.subjectStore && <span className="text-gray-500">{item.subjectStore}の </span>}
              <MemberNameLink employeeId={item.subjectId} className="font-semibold">{item.subjectName}</MemberNameLink>
              <span> さんが </span>
              <span className="font-semibold text-rose-600">{item.gradeLabel}</span>
              <span> 合格しました！🎉</span>
            </p>
          )}
          <p className="text-[10px] text-gray-400 mt-0.5">
            {timeAgo(item.createdAt)}
            {item.createdByName && item.kind === 'grade' && <span className="ml-1">・{item.createdByName} より</span>}
          </p>
        </div>
      </div>

      {/* ♡ ＋ コメント（タイムライン共通の反応） */}
      <div className="flex items-center gap-4 mt-1.5 pl-6">
        <button onClick={toggleLike} disabled={isPending} className="flex items-center gap-1 transition-colors">
          <Heart className={cn('w-5 h-5', reacted ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-red-400')} />
          {likeCount > 0 && <span className={cn('text-xs font-medium', reacted ? 'text-red-500' : 'text-gray-500')}>{likeCount}</span>}
        </button>
        <button onClick={() => setShowComments(v => !v)} className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors">
          <MessageCircle className="w-5 h-5" />
          {comments.length > 0 && <span className="text-xs font-medium text-gray-500">{comments.length}</span>}
        </button>
      </div>
      {likerNames.length > 0 && (
        <p className="text-[11px] text-gray-500 mt-1 pl-6 truncate">
          <span className="font-semibold">{likerNames.slice(0, 3).join('、')}</span>
          {likerNames.length > 3 && `、他${likerNames.length - 3}人`} が❤️しました
        </p>
      )}

      {(showComments || comments.length > 0) && (
        <div className="mt-2 ml-6 space-y-2 border-t pt-2">
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-2">
              <CertRingAvatar employeeId={c.employee_id} src={reactorAvatars[c.employee_id]} name={reactorNames[c.employee_id] ?? '?'} size={24} className="flex-shrink-0 mt-0.5" fallbackClassName="bg-gray-100 text-gray-600" />
              <div className="flex-1 min-w-0">
                <p className="text-xs">
                  <MemberNameLink employeeId={c.employee_id} className="font-semibold text-gray-700">{reactorNames[c.employee_id] ?? '不明'}</MemberNameLink>
                  <span className="text-gray-400 ml-1">{timeAgo(c.created_at)}</span>
                </p>
                <p className="text-sm text-gray-700 mt-0.5">{c.content}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1">
            <Input
              placeholder="お祝いコメントを送る..."
              value={commentInput}
              onChange={e => setCommentInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addComment() }}
              className="text-sm h-8 flex-1"
              disabled={isPending}
            />
            <Button size="sm" className="h-8 w-8 p-0 bg-orange-500 hover:bg-orange-600" onClick={addComment} disabled={isPending || !commentInput.trim()}>
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}


/**
 * デイリーレポートの本文（構造化データがあるとき）。
 * 名前はタイムラインの絞り込みリンク（その日・その人の分だけ表示。解除すれば全部見える）。
 * 本文末尾の「承認をお待ちの申請」などの追記は、テキスト本文から該当部分を拾って下に出す。
 */
function DailyReportBody({ payload, body }: { payload: DailyReportPayload; body: string | null }) {
  const p = payload
  const [stalledOpen, setStalledOpen] = useState(false)
  const slash = `${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8, 10))}`
  const tl = (params: Record<string, string>) => `/timeline?${new URLSearchParams({ date: p.date, ...params }).toString()}`
  const totalCerts = p.achievers.reduce((s, a) => s + a.count, 0)
  const nameLink = (href: string, name: string) => (
    <Link href={href} className="font-semibold text-orange-800 underline decoration-orange-300 underline-offset-2 hover:text-orange-600">{name}</Link>
  )
  // 構造化データに滞留が無い古いレポートは、テキスト本文の「⏳」以降をそのまま出す
  const extraIdx = body && !p.stalled ? body.indexOf('⏳') : -1
  const extra = extraIdx >= 0 ? body!.slice(extraIdx) : null
  const achieverPeople = p.achievers.length + p.achieversMore
  const STALLED_SHOWN = 10

  return (
    <div className="text-xs text-gray-700 mt-0.5 leading-relaxed space-y-2">
      <p>{slash}は全社で {achieverPeople}人 {totalCerts}件 のスキルが認定されました！</p>
      {p.achievers.length > 0 && (
        <div>
          <p>🏅 スキルを習得した方✨  おめでとうございます！</p>
          <ul className="pl-1">
            {p.achievers.map(a => (
              <li key={a.id}>・{nameLink(tl({ achiever: a.id }), `${a.name}さん`)}{a.store && <span className="text-gray-500">　{a.store}</span>}
                <span className="text-gray-500">{a.count > 1 ? `（${a.count}件：${a.skill} ほか）` : `（${a.skill}）`}</span></li>
            ))}
            {p.achieversMore > 0 && <li>・…ほか{p.achieversMore}名が習得！</li>}
          </ul>
        </div>
      )}
      {p.certifiers.length > 0 && (
        <div>
          <p>🤝 認定いただいた方✨ ありがとうございました</p>
          <ul className="pl-1">
            {p.certifiers.slice(0, 8).map(c => (
              <li key={c.id}>・{nameLink(tl({ certifier: c.id }), `${c.name}さん`)}{c.count > 1 && <span className="text-gray-500">（{c.count}件）</span>}</li>
            ))}
            {p.certifiers.length > 8 && <li>・…ほか{p.certifiers.length - 8}名</li>}
          </ul>
        </div>
      )}
      {p.praisers.length > 0 && (
        <div>
          <p>💬 メッセージを贈った方✨ ありがとうございました</p>
          <ul className="pl-1">
            {p.praisers.slice(0, 8).map(c => (
              <li key={c.id}>・{nameLink(tl({ praiser: c.id }), `${c.name}さん`)}{c.count > 1 && <span className="text-gray-500">（{c.count}件）</span>}</li>
            ))}
            {p.praisers.length > 8 && <li>・…ほか{p.praisers.length - 8}名</li>}
          </ul>
        </div>
      )}
      {p.applicants.people > 0 && <p>✨ 新しい挑戦 … {p.applicants.people}名が新しいスキル{p.applicants.count}件を申請しました</p>}
      {p.newMembers.length > 0 && (
        <p>🎉 新しい仲間 … {p.newMembers.map((m, i) => (
          <span key={m.id}>{i > 0 && '、'}<MemberNameLink employeeId={m.id} className="font-semibold">{m.name}</MemberNameLink>さん</span>
        ))}が仲間入り！<br />　Mission Board へようこそ！</p>
      )}
      {p.streak >= 3 && <p>🔥 {p.streak}日連続で習得が生まれています！</p>}
      <p>今日も、あなたの「できた！」をお待ちしています ☆<br />素敵な１日になりますように (^^)</p>
      {extra && <p className="whitespace-pre-line border-t border-orange-200 pt-1.5">{extra}</p>}
      {p.stalled && p.stalled.total > 0 && (
        <div className="border-t border-orange-200 pt-1.5 space-y-2">
          <div>
            <p>⏳ <span className="font-semibold">承認者の方へ</span> 承認待ち申請が {p.stalled.total}件 あります<span className="text-gray-500">（申請の翌日中に承認されていないもの）</span></p>
            {p.stalled.byTeam ? (
              <ul className="pl-1">
                {(stalledOpen ? p.stalled.byTeam : p.stalled.byTeam.slice(0, STALLED_SHOWN)).map(t => (
                  <li key={t.teamId}>・{nameLink(`/approvals?team=${t.teamId}`, t.teamName)} {t.count}件<span className="text-gray-500"> 最長{t.maxDays}日（承認者 {t.approverNames.map(n => `${n}さん`).join('、')}）</span></li>
                ))}
                {p.stalled.byTeam.length > STALLED_SHOWN && (
                  <li>
                    <button onClick={() => setStalledOpen(v => !v)} className="text-orange-700 underline decoration-orange-300 underline-offset-2 hover:text-orange-600">
                      {stalledOpen ? '・閉じる' : `・…ほか${p.stalled.byTeam.length - STALLED_SHOWN}店舗・チーム（タップで全部を表示）`}
                    </button>
                  </li>
                )}
              </ul>
            ) : p.stalled.byApprover ? (
              <ul className="pl-1">
                {(stalledOpen ? p.stalled.byApprover : p.stalled.byApprover.slice(0, STALLED_SHOWN)).map(a => (
                  <li key={a.id}>・{nameLink(`/approvals?approver=${a.id}`, `${a.name}さん`)}: {a.count}件<span className="text-gray-500">（最長 {a.maxDays}日）</span></li>
                ))}
                {p.stalled.byApprover.length > STALLED_SHOWN && (
                  <li>
                    <button onClick={() => setStalledOpen(v => !v)} className="text-orange-700 underline decoration-orange-300 underline-offset-2 hover:text-orange-600">
                      {stalledOpen ? '・閉じる' : `・…ほか${p.stalled.byApprover.length - STALLED_SHOWN}名（タップで全員を表示）`}
                    </button>
                  </li>
                )}
              </ul>
            ) : null}
            <p>　承認センターからの認定を、どうぞよろしくお願いします！</p>
          </div>
          {p.stalled.unassigned.length > 0 && (
            <div>
              <p>🏬 <span className="font-semibold">運用管理者の方へ</span> 承認者未定の店舗・チームがあります。対応をお願いします。</p>
              <ul className="pl-1">
                {p.stalled.unassigned.map(u => (
                  <li key={u.teamId ?? 'none'}>・{u.teamId ? nameLink(`/admin/teams?team=${u.teamId}`, u.teamName) : nameLink('/admin/store-stats?open=none&filter=pending', u.teamName)}: {u.count}件{!u.teamId && <span className="text-gray-500">（店舗・部署に所属していない人の申請。所属の設定をお願いします）</span>}</li>
                ))}
              </ul>
              <p className="text-[10px] text-gray-400">店舗名をタップすると所属一覧の該当チームが開きます（担当リーダーの設定）。「所属なし」は店舗別スキル状況の該当メンバー一覧が開きます</p>
            </div>
          )}
        </div>
      )}
      <p className="text-[10px] text-gray-400">名前をタップするとタイムラインが、店舗名をタップすると承認センターが、その分だけに絞り込まれます</p>
    </div>
  )
}
