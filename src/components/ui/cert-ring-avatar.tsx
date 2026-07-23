'use client'

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { CertRing } from '@/components/ui/cert-ring'
import { useCertRanks } from '@/components/layout/cert-ring-context'
import { hasCertDecoration, type CertRanks } from '@/lib/cert-ranks'
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
  fallbackClassName,
  ranks: ranksProp,
}: {
  employeeId?: string | null
  src?: string | null
  name?: string | null
  size?: number
  className?: string
  fallbackClassName?: string
  ranks?: CertRanks
}) {
  const fromCtx = useCertRanks(employeeId)
  const ranks = ranksProp ?? fromCtx
  const decorated = hasCertDecoration(ranks)

  // リングがあるときはアバターを少し内側に寄せ、リングとの間に余白を作る
  const insetRatio = decorated ? (ranks!.star ? 0.19 : 0.14) : 0
  const inset = size * insetRatio
  const avatarSize = size - inset * 2
  const initial = (name ?? '').charAt(0)

  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <Avatar
        className="absolute overflow-hidden rounded-full"
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
      {decorated && <CertRing ranks={ranks!} size={size} idKey={employeeId || initial || 'x'} />}
    </span>
  )
}
