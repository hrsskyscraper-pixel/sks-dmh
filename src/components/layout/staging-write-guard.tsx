'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PRODUCTION_URL } from '@/lib/app-env'

/**
 * 開発版（ステージング）で何かを保存・変更しようとした瞬間に、
 * 「ここは開発版で、本番には反映されない」ことを確認する（2026-10-19 須貝さん指示。
 * 運営担当が本番のつもりで開発版のスキルを更新してしまった件から）。
 *
 * 保存ボタンは画面ごとに作りが違うので、個々のボタンではなく通信で捕まえる:
 * - サーバーアクション（Next-Action ヘッダ付きの通信）
 * - ブラウザから Supabase へ直接の書き込み（/rest/v1/・/storage/v1/ への GET 以外）
 * ただし画面を開いたときに自動で走る読み込み（件数取得など）で出さないよう、
 * ボタン操作・送信の直後（GESTURE_WINDOW_MS 以内）の通信だけを対象にする。リンクでの移動は対象外。
 * 「続ける」を選んだら ACK_MS のあいだ（このタブ内）は聞き直さない。
 * root layout から開発版のときだけ描画される。本番には入らない。
 */
const GESTURE_WINDOW_MS = 3000
const ACK_MS = 30 * 60 * 1000
const ACK_KEY = 'staging-write-ack-until'
const GESTURE_SELECTOR =
  'button, [type="submit"], [role="button"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], input[type="checkbox"], input[type="radio"]'

function readAckUntil(): number {
  try {
    return Number(sessionStorage.getItem(ACK_KEY) ?? 0)
  } catch {
    return 0
  }
}

function writeAckUntil(until: number) {
  try {
    sessionStorage.setItem(ACK_KEY, String(until))
  } catch {
    // 保存できない環境でも、このタブを開いているあいだはメモリ上の値で足りる
  }
}

function isWriteRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const req = input instanceof Request ? input : null
  const method = (init?.method ?? req?.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return false
  const headers = new Headers(init?.headers ?? req?.headers)
  if (headers.has('next-action')) return true
  const url = req ? req.url : String(input)
  return url.includes('/rest/v1/') || url.includes('/storage/v1/')
}

export function StagingWriteGuard() {
  const [open, setOpen] = useState(false)
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  useEffect(() => {
    let lastGesture = 0
    let ackUntil = readAckUntil()
    let pending: Promise<boolean> | null = null

    const onPointer = (e: Event) => {
      const target = e.target as Element | null
      if (target?.closest?.(GESTURE_SELECTOR)) lastGesture = Date.now()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') lastGesture = Date.now()
    }
    const onSubmit = () => {
      lastGesture = Date.now()
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('submit', onSubmit, true)

    const ask = () =>
      new Promise<boolean>((resolve) => {
        resolverRef.current = resolve
        setOpen(true)
      })

    const originalFetch = window.fetch
    window.fetch = async (input, init) => {
      const needsConfirm =
        Date.now() - lastGesture < GESTURE_WINDOW_MS &&
        Date.now() > ackUntil &&
        isWriteRequest(input, init)
      if (needsConfirm) {
        // 同時に複数の書き込みが走っても、確認は1回にまとめる
        pending ??= ask().finally(() => {
          pending = null
        })
        const ok = await pending
        if (!ok) throw new Error('開発版での変更をやめました（本番には何も反映されていません）')
        ackUntil = Date.now() + ACK_MS
        writeAckUntil(ackUntil)
      }
      return originalFetch(input, init)
    }

    return () => {
      window.fetch = originalFetch
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('submit', onSubmit, true)
    }
  }, [])

  const answer = (ok: boolean) => {
    setOpen(false)
    resolverRef.current?.(ok)
    resolverRef.current = null
  }

  const openProduction = () => {
    const { pathname, search } = window.location
    window.open(`${PRODUCTION_URL}${pathname}${search}`, '_blank', 'noopener')
    answer(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) answer(false) }}>
      <DialogContent className="max-w-sm border-4 border-orange-500" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-orange-700">ここは開発版です</DialogTitle>
          <DialogDescription className="text-gray-700">
            ここで変えた内容は、<strong>本番には反映されません</strong>。
            本番の設定を変えたいときは、本番の画面で操作してください。
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-gray-500">
          「続ける」を選ぶと、このあと30分はこの確認を出しません。
        </p>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={openProduction} className="w-full bg-orange-600 hover:bg-orange-700">
            本番の画面を開く
          </Button>
          <Button variant="outline" onClick={() => answer(true)} className="w-full">
            開発版と分かったうえで続ける
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
