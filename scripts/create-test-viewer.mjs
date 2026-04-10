/**
 * テスト閲覧用アカウントを作成するスクリプト
 *
 * Usage:
 *   node scripts/create-test-viewer.mjs [email] [password]
 *
 * デフォルト:
 *   email:    viewer@growth-driver.test
 *   password: GrowthDriver2026!
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}

const email = process.argv[2] || 'viewer@growth-driver.test'
const password = process.argv[3] || 'GrowthDriver2026!'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log(`\nCreating test viewer account: ${email}\n`)

  // 1. Check if auth user already exists
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const existing = users?.find(u => u.email === email)

  let authUserId

  if (existing) {
    console.log(`Auth user already exists (id: ${existing.id}). Updating password...`)
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    })
    if (error) {
      console.error('Failed to update auth user:', error.message)
      process.exit(1)
    }
    authUserId = existing.id
  } else {
    // Create auth user
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'テスト 閲覧者' },
    })
    if (error) {
      console.error('Failed to create auth user:', error.message)
      process.exit(1)
    }
    authUserId = data.user.id
    console.log(`Auth user created (id: ${authUserId})`)
  }

  // 2. Upsert employees record
  const { data: empExisting } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (empExisting) {
    // Update to ensure correct role and status
    const { error } = await supabase
      .from('employees')
      .update({ role: 'testuser', status: 'approved' })
      .eq('id', empExisting.id)
    if (error) {
      console.error('Failed to update employee:', error.message)
      process.exit(1)
    }
    console.log(`Employee record updated (id: ${empExisting.id})`)
  } else {
    const { data, error } = await supabase.from('employees').insert({
      auth_user_id: authUserId,
      last_name: 'テスト',
      first_name: '閲覧者',
      email,
      role: 'testuser',
      status: 'approved',
      employment_type: '社員',
    }).select('id').single()
    if (error) {
      console.error('Failed to create employee:', error.message)
      process.exit(1)
    }
    console.log(`Employee record created (id: ${data.id})`)
  }

  console.log('\n========================================')
  console.log('  Test Viewer Account Ready')
  console.log('========================================')
  console.log(`  Email:    ${email}`)
  console.log(`  Password: ${password}`)
  console.log('========================================')
  console.log('\nLogin page: "メールアドレスでログイン" link')
  console.log('')
}

main().catch(console.error)
