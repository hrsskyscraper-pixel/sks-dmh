'use client'

import { useRef, useMemo, useEffect } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { MAX_SKILL_PHOTOS } from '@/lib/skill-photos'

interface Props {
  files: File[]
  onChange: (files: File[]) => void
  /** 既に添付済みの写真（再申請時に表示。新規選択すると差し替え） */
  existingUrls?: string[]
  disabled?: boolean
}

export function SkillPhotoInput({ files, onChange, existingUrls = [], disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const remaining = MAX_SKILL_PHOTOS - files.length

  // プレビュー用 object URL（files 変更時に再生成し、不要分は破棄）
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews])

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list).filter(f => f.type.startsWith('image/'))
    onChange([...files, ...incoming].slice(0, MAX_SKILL_PHOTOS))
    if (inputRef.current) inputRef.current.value = ''
  }
  const removeAt = (i: number) => onChange(files.filter((_, idx) => idx !== i))

  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1">写真（任意・最大{MAX_SKILL_PHOTOS}枚）</p>
      {existingUrls.length > 0 && files.length === 0 && (
        <div className="mb-2">
          <p className="text-[10px] text-gray-400 mb-1">添付済み（新しく選ぶと差し替わります）</p>
          <div className="flex gap-2 flex-wrap">
            {existingUrls.map((u, i) => (
              <img key={i} src={u} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {files.map((f, i) => (
          <div key={i} className="relative w-16 h-16">
            <img src={previews[i]} alt={f.name} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label="写真を削除"
              className="absolute -top-1.5 -right-1.5 bg-gray-800 text-white rounded-full w-5 h-5 flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {remaining > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-orange-300 hover:text-orange-400 disabled:opacity-50"
          >
            <ImagePlus className="w-5 h-5" />
            <span className="text-[9px] mt-0.5">追加</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => addFiles(e.target.files)}
      />
    </div>
  )
}
