import type { SupabaseClient } from '@supabase/supabase-js'

/** スキル申請の添付写真を保存する非公開バケット */
export const SKILL_PHOTOS_BUCKET = 'skill-photos'
/** 1申請あたりの最大添付枚数 */
export const MAX_SKILL_PHOTOS = 4

/**
 * 画像を JPEG に正規化＋長辺を縮小して返す（ブラウザ専用）。
 * - HEIC/HEIF など非対応 mime を、表示・保存できる JPEG に変換する
 *   （createImageBitmap は Safari で HEIC をデコード可能）
 * - 5MB 制限を超えにくいよう長辺を maxDim px に収める
 * - 変換できない環境では原本のまま返す（フォールバック）
 */
async function normalizeToJpeg(file: File, maxDim = 2000, quality = 0.9): Promise<File> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/jpeg', quality))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

/**
 * 申請写真をアップロードし、保存したストレージパスの配列を返す（ブラウザから呼ぶ）。
 * クライアントで JPEG へ正規化・縮小したうえで、サーバー API 経由で
 * service-role アップロードする（ストレージ RLS に依存しない）。
 */
export async function uploadSkillPhotos(skillId: string, files: File[]): Promise<string[]> {
  if (!files.length) return []
  const jpegs = await Promise.all(files.map(f => normalizeToJpeg(f)))
  const form = new FormData()
  form.append('skillId', skillId)
  for (const j of jpegs) form.append('files', j)
  const res = await fetch('/api/skill-photo-upload', { method: 'POST', body: form })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `アップロードに失敗しました (${res.status})`)
  }
  const { paths } = await res.json()
  return (paths ?? []) as string[]
}

/** 古い写真を削除（差し替え時・ベストエフォート） */
export async function deleteSkillPhotos(supabase: SupabaseClient, paths: string[]): Promise<void> {
  if (!paths.length) return
  try {
    await supabase.storage.from(SKILL_PHOTOS_BUCKET).remove(paths)
  } catch {
    // 失敗しても致命的ではない（孤立ファイルが残るのみ）
  }
}

/**
 * ストレージパス配列 → { パス: 署名付きURL } のマップ。
 * サーバーの service-role クライアントで呼ぶ（非公開バケットの閲覧用）。
 */
export async function signSkillPhotoPaths(
  supabase: SupabaseClient,
  paths: string[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
  const unique = [...new Set(paths)].filter(Boolean)
  if (!unique.length) return {}
  const { data } = await supabase.storage.from(SKILL_PHOTOS_BUCKET).createSignedUrls(unique, expiresIn)
  const map: Record<string, string> = {}
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl
  }
  return map
}
