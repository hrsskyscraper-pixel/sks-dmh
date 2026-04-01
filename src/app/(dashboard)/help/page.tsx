import { TopBar } from '@/components/layout/nav'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard, CheckSquare, BadgeCheck, Building2, Users2, Settings,
  Target, Award, Star, MessageCircle, UserPlus, Pencil, Bell, LogIn,
  ChevronRight, HelpCircle
} from 'lucide-react'

const sections = [
  {
    id: 'overview',
    title: 'Growth Driver とは',
    icon: HelpCircle,
    content: `Growth Driver は、スキル習得の進捗管理と成長支援のためのアプリです。

**「GAPから、次の一歩へ。」**

目標と現状のGAPを可視化し、一人ひとりの成長を加速させます。

**主な機能：**
- スキルの申請・認定ワークフロー
- チーム・店舗・部署の管理
- メンバーのキャリア記録
- 目標管理
- メール・LINE通知`,
  },
  {
    id: 'login',
    title: 'ログイン・参加申請',
    icon: LogIn,
    content: `**初めてのログイン**
1. Googleアカウントでログイン
2. 参加依頼画面が表示されます
3. 氏名、店舗/部署、チームを選択し「参加依頼」
4. 管理者の承認を待ちます
5. 承認されるとメール・LINEで通知が届きます
6. 再度ログインするとダッシュボードが表示されます

**LINE連携**
- ダッシュボードに「LINE通知を受け取れます」バナーが表示されます
- 「連携する」をタップしてLINEアカウントを連携すると、各種通知がLINEにも届きます`,
  },
  {
    id: 'dashboard',
    title: 'ダッシュボード',
    icon: LayoutDashboard,
    content: `ログイン後に表示されるホーム画面です。

**ウェルカムカード**
- 全体達成率、認定済み / 差し戻し / 申請中 / 未申請 の件数
- 現在の目標（キャリア記録の目標から最も近い期日のもの）
- 所属チーム・店舗・プロジェクト名

**お知らせ**
- スキルが認定/差し戻しされた通知
- 差し戻しの場合は「再申請」ボタンから直接再申請へ

**対応が必要です**（マネージャー以上）
- 認定待ちのスキル申請件数
- チーム変更の承認依頼件数

**次のステップ**
- 今取り組むべき未申請スキルの一覧
- 遅れているスキルがある場合は赤で表示

**ナビバーのバッジ**
- ダッシュボード: 遅れスキル（赤）/ 次のステップ（青）
- スキル: 差し戻し件数（赤）
- 承認: 承認待ち合計件数（赤）`,
  },
  {
    id: 'skills',
    title: 'スキル',
    icon: CheckSquare,
    content: `スキルの申請・管理を行う画面です。

**タブ構成**
| タブ | 内容 |
|------|------|
| 未申請 | チェックリスト形式。フェーズ・カテゴリごとに表示。「申請する」ボタンで申請 |
| 申請中 | 承認待ちのスキル |
| 差し戻し | 差し戻されたスキル。「再申請する」ボタンで再申請可能 |
| 承認済 | 認定されたスキル |

**スキル申請の流れ**
1. 未申請タブで「申請する」をタップ
2. コメントを入力（任意）して申請
3. マネージャーにメール・LINE通知が届く
4. マネージャーが認定 or 差し戻し
5. 結果がメール・LINEで届く

**対話履歴**
- 申請中・差し戻し・承認済のカードをタップすると、LINE風の対話履歴が表示されます
- 申請 → 差し戻し → 再申請 → 認定 の全てのやり取りが確認できます`,
  },
  {
    id: 'approvals',
    title: '承認センター',
    icon: BadgeCheck,
    content: `全ての承認待ち案件を1画面で管理できます。（マネージャー以上）

**タブ構成**
| タブ | 内容 |
|------|------|
| すべて | 全種類の承認待ちを新しい順に表示 |
| スキル認定 | スキル認定の申請一覧。「認定」「戻す」ボタンで操作 |
| チーム変更 | チーム変更申請。「承認」「却下」ボタン |
| 参加許諾 | 新規メンバーの参加依頼。氏名・店舗・チーム・ロールを設定して承認 |
| 処理済み | 自分が処理した認定/差し戻しの履歴 |

**スキル認定の操作**
- カードをタップ → 対話履歴を確認
- 履歴の末尾に「認定」「戻す」ボタン
- コメントを添えて認定/差し戻し
- 申請者にメール・LINE通知が届く`,
  },
  {
    id: 'teams',
    title: 'チーム',
    icon: Building2,
    content: `チーム・部署・店舗の一覧と管理画面です。

**自分の所属**
- 画面上部に自分が所属するチーム・部署・店舗をまとめて表示
- タップで展開してメンバー・リーダーを確認

**すべてのチーム・部署・店舗**
- クリックで展開。店舗は都道府県別に折りたたみ表示
- プロジェクトが紐づいているチームはプロジェクト名がバッジで表示

**チーム作成**（運用管理者以上）
- 種別: チーム / 部署 / 店舗
- リーダー（主）: 1人（必須）
- リーダー（副）: 複数選択可
- メンバー: 複数選択可

**チーム編集**（運用管理者以上）
- チーム名をクリック → 名前・種別・都道府県を編集`,
  },
  {
    id: 'members',
    title: 'メンバー',
    icon: Users2,
    content: `全メンバーの一覧画面です。

**フィルタ**
- チーム / 部署 でフィルタ（デフォルトは自分の所属チーム）
- 店舗は都道府県別折りたたみで絞り込み

**メンバーカード**
- アバター、名前、SNSアイコン（Instagram / LINE）
- ロール、役職、社内資格
- 入社年月・年数
- 進捗バー（認定率 vs 標準進捗）

**編集**（運用管理者以上、またはマネージャーが自チームメンバー）
- ⋮ メニューから: 名前編集、ロール変更
- アバター写真をクリックでアップロード`,
  },
  {
    id: 'career',
    title: 'メンバーキャリア',
    icon: Pencil,
    content: `メンバーの詳細情報とキャリア記録の管理画面です。
メンバー一覧からメンバーをタップ、またはMyメニューの「Myキャリア」からアクセス。

**プロフィール**
- 名前（ふりがな）、メール、ロール、入社日（年目）、生年月日（年齢）
- 役職、社内資格チップ、Instagram / LINE、LINE連携状態
- 「プロフィールを編集」から編集可能

**所属**
- 所属する店舗・部署・チームをチップ表示
- 「追加」ボタンで所属を追加可能

**キャリア記録**
記録の種別:
| 種別 | 内容 |
|------|------|
| 面接 | 面接の記録 |
| 採用 | 採用決定の記録 |
| 入社 | 入社日の記録（最も古い日付がプロフィールの入社日になる） |
| 配属・異動 | 配属先・異動先 |
| 育成 | 育成に関する記録 |
| 役職 | 役職名（最新のものがプロフィールに表示） |
| 資格 | 社内資格（プルダウン選択）または社外資格（自由入力） |
| 目標 | 目標期日・目標内容・理由/目的 |
| その他 | 自由記録 |`,
  },
  {
    id: 'settings',
    title: '設定',
    icon: Settings,
    content: `管理者向けの設定画面です。（運用管理者・役員・開発者のみ）

**プロジェクト管理**
- プロジェクトの作成・編集・アーカイブ
- フェーズ設定（目標時間の設定）
- スキル割当
- チームタブ: プロジェクトにチーム・部署・店舗を紐づけ

**CSV取込**
- 勤務時間データの一括インポート

**社内資格マスタ**
- 社内資格の追加・編集・削除
- アイコン（資格 / 星）と色（8色）の選択`,
  },
  {
    id: 'roles',
    title: 'ロールと権限',
    icon: Award,
    content: `| ロール | 権限 |
|--------|------|
| メイト | スキル申請、自分の情報閲覧 |
| 社員 | メイトと同じ |
| 店長 | 自店舗メンバーの認定・編集、参加許諾（メイト/社員のみ） |
| マネジャー | 自チームメンバーの認定・編集、参加許諾（メイト/社員のみ） |
| 運用管理者 | 全メンバーの認定・編集、チーム管理、設定、参加許諾（全ロール） |
| 役員 | 運用管理者と同じ |
| 開発者 | 全権限 + テストユーザーモード |`,
  },
  {
    id: 'notifications',
    title: '通知',
    icon: Bell,
    content: `**メール通知**
- スキル申請/再申請時 → マネージャーに通知
- スキル認定/差し戻し時 → 申請者に通知
- 参加依頼時 → マネージャー・管理者に通知
- 参加承認時 → 申請者に通知

**LINE通知**
- メール通知と同じタイミングでLINEにも通知（LINE連携済みの場合）
- LINE連携はダッシュボードのバナーから設定

**アプリ内通知**
- ダッシュボードの「お知らせ」セクション
- 通知ベル（ヘッダー右上）`,
  },
]

export default function HelpPage() {
  return (
    <>
      <TopBar title="使い方ガイド" />
      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {/* 目次 */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-700">目次</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-1">
              {sections.map(s => (
                <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2 py-1.5 text-sm text-gray-600 hover:text-orange-600 transition-colors">
                  <s.icon className="w-4 h-4 flex-shrink-0" />
                  {s.title}
                  <ChevronRight className="w-3 h-3 ml-auto text-gray-300" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* セクション */}
        {sections.map(s => (
          <Card key={s.id} id={s.id}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <s.icon className="w-5 h-5 text-orange-500" />
                {s.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="prose prose-sm max-w-none text-gray-600 [&_table]:w-full [&_table]:text-xs [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_td]:border [&_th]:text-left [&_strong]:text-gray-800 [&_h2]:text-sm [&_h2]:mt-3 [&_h2]:mb-1 whitespace-pre-line">
                {s.content.split('\n').map((line, i) => {
                  const trimmed = line.trim()
                  if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
                    return <p key={i} className="font-semibold text-gray-800 mt-3 mb-1">{trimmed.replace(/\*\*/g, '')}</p>
                  }
                  if (trimmed.startsWith('|')) {
                    // テーブル行
                    const cells = trimmed.split('|').filter(c => c.trim()).map(c => c.trim())
                    if (cells.every(c => c.match(/^-+$/))) return null // セパレータ行
                    const isHeader = i > 0 && sections.find(sec => sec.content.split('\n')[sections.find(sec2 => sec2.content.includes(trimmed))?.content.split('\n').indexOf(trimmed) ?? -1 + 1]?.trim().startsWith('|--'))
                    return (
                      <div key={i} className="flex border-b border-gray-200 text-xs">
                        {cells.map((cell, j) => (
                          <div key={j} className={`flex-1 px-2 py-1.5 ${j === 0 ? 'font-medium text-gray-700 bg-gray-50' : 'text-gray-600'}`}>{cell}</div>
                        ))}
                      </div>
                    )
                  }
                  if (trimmed.startsWith('- ')) {
                    return <p key={i} className="pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-orange-400">{trimmed.slice(2)}</p>
                  }
                  if (trimmed.match(/^\d+\./)) {
                    return <p key={i} className="pl-4">{trimmed}</p>
                  }
                  if (!trimmed) return <div key={i} className="h-1" />
                  return <p key={i}>{trimmed}</p>
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
