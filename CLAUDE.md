# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code (claude.ai/code) に対するガイドです。

## プロジェクト概要

**Mission Board**（ミッションボード）(`sks-dmh`) — 複数ブランド（CoCo壱・ラーメン大戦争・flax&BEAUTY）を運営する企業向けの、店舗スタッフのスキル習得・チーム管理 Webアプリ。

- スタック: Next.js 16（App Router）+ React 19 + Supabase（Postgres + Auth）+ TailwindCSS 4 + shadcn/ui（Radix）
- デプロイ: Vercel（本番: `https://sks-dmh.vercel.app`）
- **UIはすべて日本語**。ユーザー向けの文言・応答は指示がない限り日本語で記述する

## コマンド

```bash
npm run dev          # ローカル開発サーバー（http://localhost:3000）
npm run build        # 本番ビルド（コンパイル確認用にも利用）
npm run lint         # eslint
npx tsc --noEmit     # 型チェック（重要な変更をコミットする前に実施）
```

マイグレーション:
```bash
supabase db push --linked              # 未適用マイグレーションをリンク済みの Supabase プロジェクトに適用
supabase db push --linked --dry-run    # 事前確認
```
Supabase CLI は認証済み、プロジェクトはリンク済み。`supabase/migrations/` に新しいマイグレーションを作成したら、必ず push して成功を確認してからスキーマに依存したコードを書く。

バックアップ（GitHub Actions から手動実行可能）:
- `Database Backup` — 毎日 JST 03:00 に暗号化ダンプを非公開リポジトリ `sks-dmh-backups` へ送信
- `Backup Restore Test` — 最新ダンプを使い捨て Postgres に復元して行数検証

## アーキテクチャ

### ルーティング（Next.js App Router）
- `src/app/(dashboard)/` — **認証必須レイアウト配下のルートグループ**。配下の全ページは `(dashboard)/layout.tsx` を経由して、現在の employee を取得し、pending/onboarding 状態を処理して `BottomNav` を描画する。ここにページを追加すれば自動的にボトムナビが付く。
- `src/app/(dashboard)/admin/*` — 管理者専用ページ。各 `page.tsx` の冒頭でロールをチェックし `redirect('/')` する。
- `src/app/login/`, `src/app/invite/[id]/`, `src/app/privacy/`, `src/app/terms/` — 公開ページ（middleware の allow-list に登録済み）。
- `src/middleware.ts` + `src/lib/supabase/middleware.ts` — 認証ゲート。allow-list 以外へアクセスした未認証ユーザーは `/login` にリダイレクトされる。

### Supabase クライアント（`src/lib/supabase/`）
- `server.ts` — RLS を尊重するサーバークライアント（anon key + user cookie）。権限チェックに従うべき場面ではこちらを使う。
- `admin.ts` — service-role クライアント（RLS を無視）。サーバーアクションや API ルート内で **明示的なロールチェックの後** にのみ使用する。
- `client.ts` — クライアントコンポーネント用（認証・Realtime）。
- `auth-cache.ts` — `getAuthUser()` / `getCurrentEmployee()` をリクエスト単位でキャッシュ。再クエリせず必ずこちらを優先する。

### 認証と権限（現在リファクタリング進行中）
**現状**: `employees.role` カラムに業務役職とシステム権限が同居している。`docs/_WIP_NOTES.md` に記載の通り、`employment_type` + `business_role_ids[]` + `system_permission` の3属性に分離する方針で進行中。

`employees.role` の値: `employee`, `store_manager`, `manager`, `ops_manager`, `executive`, `admin`, `testuser`

よくあるグループ化（多数のファイルでインラインで書かれている。集約ヘルパーはまだ無い）:
- 「システム管理者」: `['admin', 'ops_manager', 'executive']`（プレビュー用に `'testuser'` を加える場合あり）
- 「承認者／リーダー」: `['store_manager', 'manager', 'admin', 'ops_manager', 'executive']`
- `testuser` は QA・プレビュー用。`view-as` cookie（`src/lib/view-as.ts`）を通じてほぼ管理者相当のアクセスを得る。

権限を変えるときは、ロール文字列リテラルで grep する（`grep -r "'admin'\|'ops_manager'" src/`）。単一のホワイトリスト定義は存在しない。

### データモデルの要点
- `employees` — 認証ユーザーに紐づく人。`role`, `employment_type`（社員/メイト）, `status`（pending/approved）を持つ。初回ログインで自動作成される（`(dashboard)/layout.tsx` と `invite/[id]/page.tsx` 参照）。
- `teams` — `type` でポリモーフィック（`store` | `department` | `project`）。店舗は単一の `brand_id`、部署・チームは `brand_ids[]`（複数ブランド対応）。`team-manager.tsx` の作成UIは `project` 型のみ作れる；店舗・部署は `/admin/brands` マスタから作成する。
- `team_members` / `team_managers` — 多対多。`team_managers.role` は `'primary' | 'secondary'` で、`employees.role` とは無関係。
- `skill_projects` → `project_phases` → `project_skills` → `skills` — プロジェクトにフェーズ、フェーズにスキルが紐づく。1つのスキルは複数プロジェクトに所属可能。
- `achievements` — スキル申請・認定。`status` は `pending`/`certified`/`rejected`。`achievement_history` が遷移の履歴を記録。
- `manual_library` + `skill_manuals` — Teach me Biz マニュアルのミラー。`manual_library.brand_ids[]` で複数ブランド対応。スキルのブランド（project→teams から導出）とマニュアルのブランドの互換性は `src/lib/brand-inference.ts` で判定。
- `team_invitations` — 招待トークン。`target_employee_id` が設定されていれば個人宛、null なら公開リンク。`as_manager` でメンバー／リーダーのどちらで参加するか切替。
- `admin_audit_log` — ロール変更・参加承認等を記録（`src/lib/audit.ts` 経由で書き込み）。

マイグレーションは `supabase/migrations/` に `2025010100NN_*.sql` 形式で番号付き。多くのテーブルで RLS が有効で、ポリシーは「自分のレコードは読める」「admin client で書き込む」パターンが基本。

### 通知（`src/lib/notifications/`）
- `email.ts` — Nodemailer + Gmail（アプリパスワード）。例外は呼び出し側で catch する。
- `line.ts` — LINE Messaging API で `line_user_id` に対して push。
- `index.ts` — 複合フロー: `sendJoinRequestNotification`, `sendApprovalNotification`, `sendInvitationNotification`。必ずサーバーアクションから呼び、`.catch(console.error)` でラップする。

### 選択中プロジェクト（ユーザーごとの状態）
ユーザーは複数の `skill_projects` に所属可能。「現在のプロジェクト」の解決順は:
1. URL の `?project_id=`
2. Cookie `selected_project_id`（定数は `src/lib/selected-project.ts`）
3. 参加しているプロジェクトの先頭

ダッシュボード・スキルページなどは同じ解決ロジックを共有する。書き込みは `(dashboard)/actions.ts` の `setSelectedProject(projectId)`。

### View-as（管理者プレビュー）
admin/testuser は `view_as` cookie（`src/lib/view-as.ts`）で他の社員として閲覧できる。ページとダッシュボードレイアウトは cookie を読んで「effective employee」を差し替える。多くのコンポーネントが `currentEmployee` と `effectiveEmployee` の両方を props で受け取るのはこのため。

### LINE WebView 対策
Google OAuth は LINE の内蔵ブラウザを拒否する（`disallowed_useragent`）。共有用URL（特に招待リンク）は `?openExternalBrowser=1` を自動付与する。`src/components/layout/in-app-browser-warning.tsx` が WebView を検知してフォールバックバナーを表示する。

## 規約

- **`'use client'`** は必要な場合のみ。ほとんどのページはサーバーコンポーネントで admin client を使ってデータ取得し、props でクライアントコンポーネントに渡す構造。
- **サーバーアクション**は `actions.ts` ファイルにページ・機能単位で配置。各アクションの先頭で認証 + ロールチェックを行う。
- **Supabase の select は1リクエスト最大1000行**（超過分は無音で切り捨て）。全件が前提の集計・一覧クエリは必ず `src/lib/supabase/fetch-all.ts` の `fetchAllRows` で range ページングし、一意になる `.order()`（複合PKはPK全列）を付ける。achievements は既に2,000行超。
- **CSV 取込**には `papaparse` を使用。文字コードは UTF-8 に統一（Excel 互換が必要な場合は BOM 付き）。
- **テストフレームワークは未導入**。変更の検証は `npx tsc --noEmit`、マイグレーションは `supabase db push --linked --dry-run` で行う。
- **Tailwind v4** と shadcn/ui（Radix）を使用。既存の `src/components/ui/` のコンポーネントを再利用し、新しいプリミティブを無闇に導入しない。
- **公開／非公開ページ**: `(dashboard)` ルートグループの外に置かれていても、middleware の allow-list に無ければ認証ゲートがかかる。公開にするにはルートグループの外に配置し、かつ middleware に追加する必要がある。
- **PAT スコープ**: git push は `gh` 経由。`.github/workflows/*` への push には `workflow` スコープが必要。拒否されたら `gh auth refresh -s workflow` を実行し、remote URL に埋め込まれた古いPATがあれば削除する。

## 主要な参照ファイル

- `docs/_WIP_NOTES.md` — 進行中の権限モデル再設計（3属性分離）。`employees.role` やロールチェックに触る前に必ず読む。
- `docs/BACKUP.md` — バックアップ／復元の手順と secrets 構成
- `CHANGELOG.md` — ユーザー向けリリースノート（アプリ内 `/changelog` でも表示される）
- `src/app/(dashboard)/help/page.tsx` — アプリ内ヘルプの全体像。機能カタログとして便利
