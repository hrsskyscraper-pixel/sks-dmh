'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  /** 署名付きURLの配列 */
  urls: string[]
  size?: 'sm' | 'md'
  label?: string | null
}

/** 申請写真のサムネイル表示＋タップで全画面ライトボックス */
export function SkillPhotoGallery({ urls, size = 'md', label = '申請写真' }: Props) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  if (!urls.length) return null
  const thumb = size === 'sm' ? 'w-14 h-14' : 'w-20 h-20'

  return (
    <div>
      {label && <p className="text-xs font-medium text-gray-600 mb-1">{label}（{urls.length}枚）</p>}
      <div className="flex gap-2 flex-wrap">
        {urls.map((u, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setLightbox(u)}
            className={cn('rounded-lg overflow-hidden border border-gray-200', thumb)}
          >
            <img src={u} alt={`写真${i + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
          </button>
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
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  )
}
