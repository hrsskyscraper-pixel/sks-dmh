import { NextRequest, NextResponse } from 'next/server'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { SKILL_PHOTOS_BUCKET, MAX_SKILL_PHOTOS } from '@/lib/skill-photos'

// スキル申請写真のアップロード。
// ブラウザから直接ストレージに上げるとバケットの RLS 評価で弾かれるケースがあるため、
// 認証を確認したうえで service-role クライアントでアップロードする（RLS 非依存・パスは本人IDで固定）。
export async function POST(req: NextRequest) {
  const employee = await getCurrentEmployee()
  if (!employee) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const form = await req.formData()
  const skillId = String(form.get('skillId') ?? '')
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (!skillId) return NextResponse.json({ error: 'skillId がありません' }, { status: 400 })
  if (files.length === 0) return NextResponse.json({ paths: [] })

  const db = createAdminClient()
  const paths: string[] = []
  for (let i = 0; i < Math.min(files.length, MAX_SKILL_PHOTOS); i++) {
    const buf = Buffer.from(await files[i].arrayBuffer())
    const path = `${employee.id}/${skillId}/${Date.now()}-${i}.jpg`
    const { error } = await db.storage
      .from(SKILL_PHOTOS_BUCKET)
      .upload(path, buf, { upsert: true, contentType: 'image/jpeg' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    paths.push(path)
  }
  return NextResponse.json({ paths })
}
