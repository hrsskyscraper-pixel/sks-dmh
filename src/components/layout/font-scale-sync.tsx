'use client'

import { useEffect } from 'react'
import { FONT_SCALE_COOKIE } from '@/lib/font-scale'

/**
 * DB に保存された文字サイズ設定を「正」として、<html> の font-size と
 * SSR用 Cookie を実際の値に合わせる。
 * - 同じ端末の再訪: Cookie がすでに正しく、root layout で適用済み（チラつかない）
 * - 別端末からの初回: Cookie が無い/古いので、ここで補正して Cookie を最新化する
 */
export function FontScaleSync({ scale }: { scale: number }) {
  useEffect(() => {
    document.documentElement.style.fontSize = `${scale}%`
    document.cookie = `${FONT_SCALE_COOKIE}=${scale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  }, [scale])
  return null
}
