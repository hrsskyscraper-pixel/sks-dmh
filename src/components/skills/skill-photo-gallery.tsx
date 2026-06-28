'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  /** 署名付きURLの配列 */
  urls: string[]
  size?: 'sm' | 'md'
  label?: string | null
  /** 削除を有効にする場合（管理者のみ）に指定。paths は urls と同じ並び */
  achievementId?: string
  paths?: string[]
  canDelete?: boolean
  /** すべての写真を一度ずつ拡大表示（ライトボックス）したときに呼ばれる。承認前の写真確認ゲートに使う */
  onAllViewed?: () => void
}

/** 申請写真のサムネイル表示＋タップで全画面ライトボックス。管理者には削除ボタンを表示 */
export function SkillPhotoGallery({ urls, size = 'md', label = '申請写真', achievementId, paths, canDelete, onAllViewed }: Props) {
  const [items, setItems] = useState(() => urls.map((url, i) => ({ url, path: paths?.[i] })))
  const [lightbox, setLightbox] = useState<{ url: string; path?: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [viewedIdx, setViewedIdx] = useState<Set<number>>(new Set())

  // props が変わったら（別の申請に切り替わる等）同期
  useEffect(() => {
    setItems(urls.map((url, i) => ({ url, path: paths?.[i] })))
    setViewedIdx(new Set())
  }, [urls, paths])

  // サムネイルを拡大表示（ライトボックスを開く）。全枚数を見たら onAllViewed を通知
  const openLightbox = (it: { url: string; path?: string }, i: number) => {
    setLightbox(it)
    setViewedIdx(prev => {
      if (prev.has(i)) return prev
      const next = new Set(prev).add(i)
      if (next.size >= items.length) onAllViewed?.()
      return next
    })
  }

  const showDelete = !!(canDelete && achievementId)

  const handleDelete = async (path?: string) => {
    if (!path || !achievementId) return
    if (!confirm('この写真を削除しますか？元に戻せません。')) return
    setDeleting(path)
    try {
      const res = await fetch('/api/skill-photo-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ achievementId, path }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `削除に失敗しました (${res.status})`)
      }
      setItems(prev => prev.filter(it => it.path !== path))
      setLightbox(null)
      toast.success('写真を削除しました')
    } catch (e) {
      toast.error('写真の削除に失敗しました', { description: (e as Error)?.message })
    } finally {
      setDeleting(null)
    }
  }

  if (!items.length) return null
  const thumb = size === 'sm' ? 'w-14 h-14' : 'w-20 h-20'

  return (
    <div>
      {label && <p className="text-xs font-medium text-gray-600 mb-1">{label}（{items.length}枚）</p>}
      <div className="flex gap-2 flex-wrap">
        {items.map((it, i) => (
          <div key={i} className={cn('relative rounded-lg overflow-hidden border border-gray-200', thumb)}>
            <button type="button" onClick={() => openLightbox(it, i)} className="block w-full h-full">
              <img src={it.url} alt={`写真${i + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
            </button>
            {showDelete && it.path && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDelete(it.path) }}
                disabled={deleting === it.path}
                aria-label="写真を削除"
                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600 disabled:opacity-60"
              >
                {deleting === it.path ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              </button>
            )}
          </div>
        ))}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-label="写真の拡大表示"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          {showDelete && lightbox.path && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleDelete(lightbox.path) }}
              disabled={deleting === lightbox.path}
              className="absolute top-4 right-4 inline-flex items-center gap-1 bg-red-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-700 disabled:opacity-60"
            >
              {deleting === lightbox.path ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              削除
            </button>
          )}
        </div>
      )}
    </div>
  )
}
