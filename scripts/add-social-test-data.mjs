import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wiwudtwoospratlezhuf.supabase.co'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required')
  process.exit(1)
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// テスト社員ID
const SATO = '22222222-0001-0000-0000-000000000001'    // T_佐藤美咲
const TANAKA = '22222222-0001-0000-0000-000000000002'  // T_田中花子
const YAMADA = '22222222-0001-0000-0000-000000000003'  // T_山田健二
const SUZUKI = '22222222-0002-0000-0000-000000000001'  // T_鈴木太郎
const FUJII = '22222222-0003-0000-0000-000000000001'   // T_藤井大輔
const NAKAMURA = '22222222-0003-0000-0000-000000000002' // T_中村恵子
const TAKAHASHI = '22222222-0004-0000-0000-000000000001' // T_髙橋誠

const TEST_IDS = [SATO, TANAKA, YAMADA, SUZUKI, FUJII, NAKAMURA, TAKAHASHI]

async function main() {
  // 1. 既存テストリアクション・コメント削除
  console.log('Cleaning up existing test reactions/comments...')
  await db.from('achievement_reactions').delete().in('employee_id', TEST_IDS)
  await db.from('achievement_comments').delete().in('employee_id', TEST_IDS)

  // 2. T_佐藤美咲の認定済みachievement取得（最新10件）
  const { data: satoAch } = await db.from('achievements')
    .select('id, certified_at')
    .eq('employee_id', SATO)
    .eq('status', 'certified')
    .not('certified_at', 'is', null)
    .order('certified_at', { ascending: false })
    .limit(10)

  console.log(`T_佐藤美咲の認定済み: ${satoAch?.length ?? 0}件`)

  // 3. T_田中花子の認定済みachievement取得（最新8件）
  const { data: tanakaAch } = await db.from('achievements')
    .select('id, certified_at')
    .eq('employee_id', TANAKA)
    .eq('status', 'certified')
    .not('certified_at', 'is', null)
    .order('certified_at', { ascending: false })
    .limit(8)

  console.log(`T_田中花子の認定済み: ${tanakaAch?.length ?? 0}件`)

  // 4. リアクション投入
  const reactions = []

  // 佐藤のachievementへのリアクション
  for (const ach of satoAch ?? []) {
    const reactors = [TANAKA, FUJII, TAKAHASHI, YAMADA]
    // ランダムに2-4人がリアクション
    const count = 2 + Math.floor(Math.random() * 3)
    const shuffled = reactors.sort(() => Math.random() - 0.5).slice(0, count)
    for (const r of shuffled) {
      reactions.push({ achievement_id: ach.id, employee_id: r, emoji: '❤️' })
    }
  }

  // 田中のachievementへのリアクション
  for (const ach of tanakaAch ?? []) {
    const reactors = [SATO, FUJII, YAMADA, TAKAHASHI]
    const count = 1 + Math.floor(Math.random() * 3)
    const shuffled = reactors.sort(() => Math.random() - 0.5).slice(0, count)
    for (const r of shuffled) {
      reactions.push({ achievement_id: ach.id, employee_id: r, emoji: '❤️' })
    }
  }

  if (reactions.length > 0) {
    const { error: rErr } = await db.from('achievement_reactions').upsert(reactions, { onConflict: 'achievement_id,employee_id,emoji', ignoreDuplicates: true })
    if (rErr) console.error('Reaction insert error:', rErr.message)
    else console.log(`リアクション ${reactions.length}件 投入完了`)
  }

  // 5. コメント投入
  const comments = []
  const now = new Date()

  // 佐藤のachievementへのコメント
  if (satoAch && satoAch.length >= 5) {
    comments.push(
      { achievement_id: satoAch[0].id, employee_id: FUJII, content: 'すごい！どんどん成長してるね！', created_at: new Date(now - 2 * 86400000).toISOString() },
      { achievement_id: satoAch[0].id, employee_id: TAKAHASHI, content: '順調に進んでいますね。この調子で頑張りましょう！', created_at: new Date(now - 1 * 86400000).toISOString() },
      { achievement_id: satoAch[1].id, employee_id: TANAKA, content: '私も頑張らなきゃ！刺激になります', created_at: new Date(now - 3 * 86400000).toISOString() },
      { achievement_id: satoAch[2].id, employee_id: FUJII, content: 'お客様対応もばっちりだったよ', created_at: new Date(now - 5 * 86400000).toISOString() },
      { achievement_id: satoAch[3].id, employee_id: YAMADA, content: '佐藤さん、教えてもらったおかげです！', created_at: new Date(now - 7 * 86400000).toISOString() },
      { achievement_id: satoAch[4].id, employee_id: NAKAMURA, content: '新宿店のみんな頑張ってるね！', created_at: new Date(now - 9 * 86400000).toISOString() },
    )
  }

  // 田中のachievementへのコメント
  if (tanakaAch && tanakaAch.length >= 3) {
    comments.push(
      { achievement_id: tanakaAch[0].id, employee_id: SATO, content: 'おめでとう！一緒に頑張ろうね！', created_at: new Date(now - 4 * 86400000).toISOString() },
      { achievement_id: tanakaAch[1].id, employee_id: FUJII, content: '着実にステップアップしてるね。素晴らしい！', created_at: new Date(now - 6 * 86400000).toISOString() },
      { achievement_id: tanakaAch[2].id, employee_id: TAKAHASHI, content: '次のフェーズも期待しています。', created_at: new Date(now - 10 * 86400000).toISOString() },
    )
  }

  if (comments.length > 0) {
    const { error: cErr } = await db.from('achievement_comments').insert(comments)
    if (cErr) console.error('Comment insert error:', cErr.message)
    else console.log(`コメント ${comments.length}件 投入完了`)
  }

  console.log('Done!')
}

main().catch(console.error)
