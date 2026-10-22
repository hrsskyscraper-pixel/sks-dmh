'use client'

/**
 * ログイン直後に出るモーダル（ようこそ／レベルアップ／承認の要対応）を重ねずに、順番に出すための小さな待ち行列。
 * 使い方:
 *   const release = await acquireModal()   // 前のモーダルが閉じるまで待つ
 *   setOpen(true) ... 閉じたら release()
 * ページ内だけで完結する（サーバーもストレージも使わない）。
 */
type Waiter = () => void

declare global {
  interface Window { __mbModalQueue?: { busy: boolean; waiters: Waiter[] } }
}

function state() {
  if (typeof window === 'undefined') return { busy: false, waiters: [] as Waiter[] }
  return (window.__mbModalQueue ??= { busy: false, waiters: [] })
}

export function acquireModal(): Promise<() => void> {
  return new Promise(resolve => {
    const s = state()
    const grant = () => {
      s.busy = true
      let released = false
      resolve(() => {
        if (released) return
        released = true
        s.busy = false
        const next = s.waiters.shift()
        if (next) next()
      })
    }
    if (!s.busy) grant()
    else s.waiters.push(grant)
  })
}
