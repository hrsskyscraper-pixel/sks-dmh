/**
 * いま動いているのが本番か開発版（ステージング）かの判定。
 * NEXT_PUBLIC_* はビルド時に埋め込まれるので、サーバー・ブラウザのどちらからでも呼べる。
 */

/** ステージング用 Supabase（sks-dmh-staging）のプロジェクト ref */
const STAGING_SUPABASE_REF = 'giwqelfbvsgucpnzzdao'

/** 開発版の画面から「本番を開く」で案内する先 */
export const PRODUCTION_URL = 'https://sks-dmh.vercel.app'

/** 接続先の Supabase がステージングか、NEXT_PUBLIC_APP_ENV=staging なら開発版 */
export function isStagingEnv(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return process.env.NEXT_PUBLIC_APP_ENV === 'staging' || url.includes(STAGING_SUPABASE_REF)
}
