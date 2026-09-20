'use client'

import { useState } from 'react'
import { PartyPopper, ChevronDown, ChevronUp } from 'lucide-react'
import { CertRingAvatar } from '@/components/ui/cert-ring-avatar'
import { AnnouncementCard } from '@/components/announcements/announcement-card'
import { welcomeGroupTitle } from '@/lib/announcement-groups'
import type { AnnouncementItem, AnnouncementReaction, AnnouncementComment } from '@/lib/announcements'

interface Props {
  items: AnnouncementItem[]
  reactions: AnnouncementReaction[]
  comments: AnnouncementComment[]
  reactorNames: Record<string, string>
  reactorAvatars: Record<string, string | null>
  currentEmployeeId: string
}

/**
 * 同じ日に複数名が仲間入りしたときのまとめカード。
 * 「○○さん、○○さん、○○さんの3名が仲間入り！」／「○○さん他N名が仲間入り！」。タップで1人ずつのカード（♡・コメント付き）を開く。
 */
export function WelcomeGroupCard({ items, reactions, comments, reactorNames, reactorAvatars, currentEmployeeId }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border bg-emerald-50 border-emerald-200 px-3 py-2.5">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-start gap-2 text-left">
        <PartyPopper className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {items.slice(0, 5).map(i => (
                <CertRingAvatar key={i.id} employeeId={i.subjectId} src={i.subjectAvatar} name={i.subjectName ?? '?'} size={26} className="ring-2 ring-emerald-50 rounded-full" fallbackClassName="bg-emerald-100 text-emerald-700" />
              ))}
            </div>
            <p className="text-sm text-gray-800 min-w-0">🎉 <span className="font-semibold">{welcomeGroupTitle(items)}</span></p>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">{open ? '閉じる' : 'タップで内訳を表示'}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-l-2 border-emerald-200 pl-2">
          {items.map(it => (
            <AnnouncementCard
              key={it.id}
              item={it}
              reactions={reactions.filter(r => r.announcement_id === it.id)}
              comments={comments.filter(c => c.announcement_id === it.id)}
              reactorNames={reactorNames}
              reactorAvatars={reactorAvatars}
              currentEmployeeId={currentEmployeeId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
