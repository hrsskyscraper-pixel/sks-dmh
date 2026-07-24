'use client'

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { CertRing, CertStarBadge } from '@/components/ui/cert-ring'
import { useCertRanks } from '@/components/layout/cert-ring-context'
import { type CertRanks } from '@/lib/cert-ranks'
import { cn } from '@/lib/utils'

/**
 * 資格リング付きアバター。既存の <Avatar> の置き換え用。
 * ランクは Context（CertRingProvider）から employeeId で取得する。
 * サーバー側で明示的に渡したい場合は `ranks` を直接指定できる。
 * 資格が無い社員は通常のアバター（リング無し）で表示される。
 */
export function CertRingAvatar({
  employeeId,
  src,
  name,
  size = 36,
  className,
  avatarClassName,
  fallbackClassName,
  ranks: ranksProp,
}: {
  employeeId?: string | null
  src?: string | null
  name?: string | null
  size?: number
  className?: string
  /** 内側のアバター（丸）に付けるクラス。枠線などはここに指定する（外枠が四角くならない） */
  avatarClassName?: string
  fallbackClassName?: string
  ranks?: CertRanks
}) {
  const fromCtx = useCertRanks(employeeId)
  const ranks = ranksProp ?? fromCtx

  // リング（調理／接客の2分割・初級）とスターは独立。スターは左上の小バッジ。
  const hasRing = !!ranks && (ranks.cook !== null || ranks.service !== null || ranks.beginner)
  const hasStar = !!ranks && ranks.star

  // リングがあるときだけアバターを少し内側に寄せ、リングとの間に余白を作る
  const inset = hasRing ? size * 0.14 : 0
  const avatarSize = size - inset * 2
  const initial = (name ?? '').charAt(0)
  const key = employeeId || initial || 'x'

  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {hasRing && <CertRing ranks={ranks!} size={size} idKey={key} />}
      <Avatar
        className={cn('absolute overflow-hidden rounded-full', avatarClassName)}
        style={{ width: avatarSize, height: avatarSize, left: inset, top: inset }}
      >
        <AvatarImage src={src ?? undefined} />
        <AvatarFallback
          className={cn('bg-gray-200 text-gray-500 font-bold', fallbackClassName)}
          style={{ fontSize: Math.max(10, avatarSize * 0.4) }}
        >
          {initial}
        </AvatarFallback>
      </Avatar>
      {hasStar && <CertStarBadge size={size} idKey={key} />}
    </span>
  )
}
