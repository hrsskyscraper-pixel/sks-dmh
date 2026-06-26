import type { SupabaseClient } from '@supabase/supabase-js'

/** スキル申請の添付写真を保存する非公開バケット */
export const SKILL_PHOTOS_BUCKET = 'skill-photos'
/** 1申請あたりの最大添付枚数 */
export const MAX_SKILL_PHOTOS = 4

/**
 * 申請写真をアップロードし、保存したストレージパスの配列を返す。
 * ブラウザの supabase クライアントから呼ぶ（INSERT ポリシーで許可）。
 */
export async function uploadSkillPhotos(
  supabase: SupabaseClient,
  employeeId: string,
  skillId: string,
  files: File[],
): Promise<string[]> {
  const paths: string[] = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${employeeId}/${skillId}/${Date.now()}-${i}.${ext}`
    const { error } = await supabase.storage
      .from(SKILL_PHOTOS_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) throw error
    paths.push(path)
  }
  return paths
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
