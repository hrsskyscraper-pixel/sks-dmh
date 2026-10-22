import { redirect } from 'next/navigation'
import { getDisplayRole } from '@/lib/display-role'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { CertificationManager } from '@/components/admin/certification-manager'
import { EmailNotificationToggle } from '@/components/admin/email-notification-toggle'
import { LineNotificationToggle } from '@/components/admin/line-notification-toggle'
import { OpsTeamRecipients, type OpsCandidate } from '@/components/admin/ops-team-recipients'
import { GradeWageUps } from '@/components/admin/grade-wage-ups'
import Link from 'next/link'
import { FolderKanban, Upload, Award, ChevronRight, BookOpen, Tag, Briefcase, Bell, BarChart3, UserCheck } from 'lucide-react'
import { canAdminister } from '@/lib/permissions'
import { getEmailNotificationsSetting, getGradeWageUpSetting, getLineNotificationsSetting, getOpsTeamRecipientSetting, getQaModeratorSetting } from '@/lib/settings'

export default async function SettingsPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee || !canAdminister(currentEmployee)) {
    redirect('/')
  }

  const db = createAdminClient()
  const [{ data: certifications }, emailSetting, lineSetting, opsSetting, { data: opsCandidatesRows }, qaModSetting, wageSetting] = await Promise.all([
    db
      .from('certifications')
      .select('id, name, description, icon, color, order_index, is_active, created_at')
      .order('order_index'),
    getEmailNotificationsSetting(),
    getLineNotificationsSetting(),
    getOpsTeamRecipientSetting(),
    // 運営チームの候補: 運用管理者・開発者（権限で引く。旧 role で引くと取りこぼす）
    db.from('employees').select('id, name, email, line_user_id, role, employment_type, system_permission').eq('status', 'approved')
      .in('system_permission', ['ops_admin', 'developer']).order('name'),
    getQaModeratorSetting(),
    getGradeWageUpSetting(),
  ])
  const opsCandidates: OpsCandidate[] = (opsCandidatesRows ?? []).map(e => ({
    id: e.id,
    name: e.name,
    label: getDisplayRole(e),
    hasEmail: !!e.email,
    hasLine: !!e.line_user_id,
  }))

  return (
    <>
      <TopBar title="設定" />
      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* メール通知の一括スイッチ */}
        <EmailNotificationToggle
          enabled={emailSetting.enabled}
          updatedBy={emailSetting.updatedBy}
          updatedAt={emailSetting.updatedAt}
        />
        {/* LINE通知の一括スイッチ（2026-09-20 追加） */}
        <LineNotificationToggle
          enabled={lineSetting.enabled}
          updatedBy={lineSetting.updatedBy}
          updatedAt={lineSetting.updatedAt}
        />
        {/* 改善提案・Q&A の通知先（一括休止に関係なく届く） */}
        <OpsTeamRecipients
          candidates={opsCandidates}
          selectedIds={opsSetting.ids}
          updatedBy={opsSetting.updatedBy}
          updatedAt={opsSetting.updatedAt}
        />
        {/* Q&A の投稿を非表示にできる人（2026-10-21 A-8） */}
        <OpsTeamRecipients
          kind="qa"
          candidates={opsCandidates}
          selectedIds={qaModSetting.ids}
          updatedBy={qaModSetting.updatedBy}
          updatedAt={qaModSetting.updatedAt}
        />

        {/* 級を取得したときの時給アップ（2026-10-22 A-5）。級の資格だけを並べる */}
        <GradeWageUps
          certNames={(certifications ?? []).filter(c => c.is_active && /[1-3１-３]級/.test(c.name)).map(c => c.name)}
          map={wageSetting.map}
          updatedBy={wageSetting.updatedBy}
          updatedAt={wageSetting.updatedAt}
        />

        {/* 管理メニュー */}
        <div className="space-y-2">
          <Link
            href="/admin/store-stats"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">店舗別スキル状況</p>
              <p className="text-xs text-gray-500">全店の対象人数・申請／承認／未申請・未承認件数を一覧で把握</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>

          <Link
            href="/admin/projects"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <FolderKanban className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">習得カリキュラム管理</p>
              <p className="text-xs text-gray-500">フェーズ・スキル割当・目標時間の設定</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>

          <Link
            href="/admin/business-roles"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-5 h-5 text-sky-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">業務役職マスタ</p>
              <p className="text-xs text-gray-500">役員・部長・店長・女将・育成担当 等の業務上の役職</p>
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

          <Link
            href="/admin/roster-import"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
              <Upload className="w-5 h-5 text-teal-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">名簿の一括取込</p>
              <p className="text-xs text-gray-500">入社日・退職日・社員／PA・店舗部署 を CSV から一括で登録（定着率の計算に使います）</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>

          <Link
            href="/admin/upper-approvers"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">店長の申請を承認する人</p>
              <p className="text-xs text-gray-500">店舗ごとに、店長（担当リーダー）ご本人の申請を承認する MG・課長などを決める</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>

          <Link
            href="/admin/roster-check"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">名簿と所属の違い</p>
              <p className="text-xs text-gray-500">名簿の店舗部署と、Mission Board の所属が違う人の一覧</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>

          <Link
            href="/admin/notifications"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-rose-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">通知ログ</p>
              <p className="text-xs text-gray-500">メール・LINE通知の送信結果と失敗の確認</p>
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
