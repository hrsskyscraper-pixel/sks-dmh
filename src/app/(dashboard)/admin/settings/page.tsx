import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { CertificationManager } from '@/components/admin/certification-manager'
import Link from 'next/link'
import { FolderKanban, Upload, Award, ChevronRight, BookOpen, Tag } from 'lucide-react'

export default async function SettingsPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee || !['admin', 'ops_manager', 'executive'].includes(currentEmployee.role)) {
    redirect('/')
  }

  const db = createAdminClient()
  const { data: certifications } = await db
    .from('certifications')
    .select('id, name, description, icon, color, order_index, is_active, created_at')
    .order('order_index')

  return (
    <>
      <TopBar title="設定" />
      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* 管理メニュー */}
        <div className="space-y-2">
          <Link
            href="/admin/projects"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <FolderKanban className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">プロジェクト管理</p>
              <p className="text-xs text-gray-500">フェーズ・スキル割当・目標時間の設定</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>

          <Link
            href="/admin/brands"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Tag className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">ブランド管理</p>
              <p className="text-xs text-gray-500">店舗・マニュアルのブランド区分（CoCo壱・ラーメン大戦争等）</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>

          <Link
            href="/admin/manuals"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">マニュアル連携</p>
              <p className="text-xs text-gray-500">Teach me Biz等のマニュアルをスキルに紐付け</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>

          <Link
            href="/admin/csv-import"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Upload className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">CSV取込</p>
              <p className="text-xs text-gray-500">勤務時間データの一括インポート</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>
        </div>

        {/* 社内資格マスタ */}
        <CertificationManager certifications={certifications ?? []} />
      </div>
    </>
  )
}
