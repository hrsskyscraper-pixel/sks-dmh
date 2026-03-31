import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { CertificationManager } from '@/components/admin/certification-manager'
import Link from 'next/link'
import { FolderKanban } from 'lucide-react'

export default async function SettingsPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee || !['admin', 'ops_manager', 'executive'].includes(currentEmployee.role)) {
    redirect('/')
  }

  const db = createAdminClient()
  const { data: certifications } = await db
    .from('certifications')
    .select('id, name, description, order_index, is_active, created_at')
    .order('order_index')

  return (
    <>
      <TopBar title="設定" />
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <FolderKanban className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-orange-800">マイルストーン設定はプロジェクト管理に移動しました</p>
              <p className="text-xs text-orange-700 mt-1">
                フェーズ目標時間は各プロジェクトのフェーズ設定で管理されます。
              </p>
              <Link
                href="/admin/projects"
                className="inline-block mt-3 text-xs font-medium text-orange-600 underline underline-offset-2"
              >
                プロジェクト管理へ →
              </Link>
            </div>
          </div>
        </div>

        <CertificationManager certifications={certifications ?? []} />
      </div>
    </>
  )
}
