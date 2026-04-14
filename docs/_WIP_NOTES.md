# 作業再開メモ（2026-04-15 時点）

## ✅ 権限モデル再設計: Phase 1〜4 完了、Phase 5 保留

### 背景
- メイトさん（女将）が育成リーダーをやるケースが出た
- 現在の `employees.role` カラムが「業務上の役職」と「システム権限」を混同していた
- メイト+女将+育成リーダー のような組み合わせを表現できるようにするのが目的

### 確定した設計
3つの直交した属性に分離:
1. **`employment_type`**（既存）: `社員` | `メイト`
2. **`business_role_ids`**（新規・配列）: `business_roles` マスタ参照
   - 初期データ: 役員 / 部長 / MG / 店長 / 女将 / 育成担当
   - 複数持てる（例: 店長＋育成担当）
   - 将来の追加は `/admin/business-roles` で運用管理者が行う
3. **`system_permission`**（新規・単一値）: `developer` | `ops_admin` | `training_leader` | `training_member`
   - 業務役職とは独立、自動付与はしない

### UIラベル
| 内部値 | 表示 |
|---|---|
| `developer` | 開発者 |
| `ops_admin` | 運用管理者 |
| `training_leader` | リーダー |
| `training_member` | メンバー |

### デフォルトルール（新規作成時・移行時に適用）
- 業務役職あり → `training_leader`（リーダー）
- 業務役職なし → `training_member`（メンバー）
- `developer` / `ops_admin` は個別手動設定のみ
- 業務役職の設定権限は `運用管理者` + `開発者` のみ

### 移行マッピング（Phase 1 実施済み）
| 旧 role | system_permission | business_roles 自動付与 |
|---|---|---|
| admin | developer | （なし） |
| testuser | developer | （なし） |
| executive | ops_admin | 役員 |
| ops_manager | ops_admin | 部長 |
| manager | training_leader | MG |
| store_manager | training_leader | 店長 |
| employee | training_member | （なし） |

---

## 📦 実装履歴

### Phase 1 — マイグレーション（コミット `cfdac8a`）
**マイグレーション**: `supabase/migrations/20250101000055_split_role_into_business_and_permission.sql`
- `business_roles` マスタテーブル新設（初期6件）
- `employees` に `business_role_ids uuid[]` + `system_permission text` 追加
- GIN インデックス `idx_employees_business_role_ids`
- RLS: business_roles は SELECT のみ、CRUD は service-role 経由
- 既存データを移行マッピング通りに一括更新

**コード変更**:
- `src/types/database.ts` に `BusinessRole` / `SystemPermission` / `SYSTEM_PERMISSION_LABELS` を追加
- `src/lib/supabase/auth-cache.ts` / layout / 主要 page.tsx の select に新カラム追加

### Phase 2 — 権限ヘルパー整備（コミット `c575b92` と同じ）
**ファイル**: `src/lib/permissions.ts`
- `getSystemPermission(emp)` — system_permission 優先、旧 role からフォールバック
- `isDeveloper` / `isOpsAdmin` / `isTrainingLeader` / `isTrainingMember`
- `canAdminister(emp)` — 旧 `ADMIN_ROLES.includes()` 相当
- `canApprove(emp)` — 旧 `APPROVAL_ROLES.includes()` 相当
- `canManageRoles` — canAdminister のエイリアス

### Phase 4 — 編集UI（コミット `c575b92`）
**新規**:
- `src/app/(dashboard)/admin/business-roles/page.tsx` — 業務役職マスタ管理
- `src/app/(dashboard)/admin/business-roles/actions.ts` — CRUD + `updateEmployeePermission`（dual-write）
- `src/components/admin/business-role-manager.tsx` — マスタ UI
- `src/components/admin/employee-permission-editor.tsx` — 社員詳細の権限エディタ

**更新**:
- `/admin/settings` にマスタへの導線追加
- `/admin/employees/[id]` に権限エディタを埋め込み

**dual-write の逆引きルール**（`business-roles/actions.ts` の `deriveLegacyRole`）:
- `developer` → `admin`
- `ops_admin` → 業務役職「役員」あれば `executive`、なければ `ops_manager`
- `training_leader` → 業務役職「店長」あれば `store_manager`、なければ `manager`
- `training_member` → `employee`

### Phase 3 — inline ロールチェック置換（コミット `5af6c17`）
**25 ファイル** で旧 `ADMIN_ROLES` / `APPROVAL_ROLES` / `INVITER_ROLES` の配列チェックを
`canAdminister` / `canApprove` / `isDeveloper` / `isOpsAdmin` / `isTrainingLeader` に置換。
role のみ select していた箇所には `system_permission` も追加。

主な置換先:
- `actions.ts`, `layout.tsx`, `page.tsx`, `team/page.tsx`
- `approvals/page.tsx`, `approval/page.tsx`, `notifications/page.tsx`, `help/page.tsx`
- `admin/employees/page.tsx` と `[id]/page.tsx`
- `admin/settings/page.tsx`, `admin/brands/{page,actions}.ts`
- `admin/manuals/{page,actions}.ts`, `admin/projects/{page,csv-actions}.ts`
- `admin/csv-import/page.tsx`
- `invite/actions.ts`
- `api/approval/route.ts`, `api/certify-skill/route.ts`
- `lib/notifications/index.ts`
- `components/admin/team-manager.tsx`（`canDirectEdit` 削除）
- `components/layout/nav.tsx`, `components/notifications/notification-list.tsx`

### Phase 5 — 旧 role カラム廃止（**保留中**）
実施する場合のタスク:
1. マイグレーションで `employees.role` カラムを DROP
2. `business-roles/actions.ts` の `deriveLegacyRole` と dual-write ロジックを削除
3. `types/database.ts` から `role` / `Role` 型を削除
4. `permissions.ts` の `inferFromRole` フォールバックを削除
5. 表示ロジックで `role` を参照している箇所を書き換え:
   - `employee-career-card.tsx` の `DisplayRole` / `ROLE_MAP` / `getDisplayRole` → system_permission + business_role_ids ベースに
   - `employee-manager.tsx` のロール変更ドロップダウン → 業務役職/システム権限に変更
   - その他 `role === 'testuser'` で view-as 等を判定している箇所 → `isDeveloper` または専用フラグに
6. `admin/employees/{page,[id]}` の explicit select から `role` 列を除去

実施タイミング: 1〜2週間運用して安定確認後に検討。

---

## 🧩 実装の要点（後で読み返す用）

### 現行の権限判定
- 必ず `@/lib/permissions` のヘルパー経由
- **Employee オブジェクト（少なくとも `role` と `system_permission` を含む）** を渡す
- role のみ select するクエリは NG（Phase 3 で全箇所に system_permission 追加済み）

### dual-write が必要な理由
Phase 3 後も `employees.role` は残しており、permissions ヘルパーは新旧両対応だが、
旧 role を直接見ているコードが Phase 5 完了までゼロにならない可能性に備えて、
`updateEmployeePermission` は旧 role も同期更新している。

### 業務役職の増やし方
`/admin/business-roles` から運用管理者が追加可能。`business_roles.sort_order` は
追加時に自動で `+10` されるが、並び替えUIは未実装（必要なら将来）。

---

## 📝 直近の実装履歴（時系列逆順）

### 2026-04-15 — 権限モデル再設計 Phase 1〜4 完了
- Phase 1（cfdac8a）: business_roles マスタ + system_permission/business_role_ids カラム追加・データ移行
- Phase 2+4（c575b92）: 権限ヘルパー permissions.ts 新設、業務役職マスタ管理UI、社員詳細の権限エディタ、dual-write
- Phase 3（5af6c17）: 25ファイルの inline ロールチェックをヘルパー経由に統一

### 2026-04-14 の主な変更
- チーム人物チップのクリックでプロフィール遷移
- /help, /changelog をログイン必須化 & フッター表示
- 使い方ガイドに全タブ横断検索機能
- 表示速度最適化（並列クエリ化）
- プロジェクト切替のローディング表示
- マスタ管理の統合（ブランド・店舗・部署）
- チーム作成はチーム(project)のみに制限

### 2026-04-13 の主な変更
- 招待フロー全面改善（welcomeページ、LINE送信、氏名確認ふりがな必須）
- LINE連携促進強化（フローティングボタン、参加直後CTA）
- プロジェクト選択永続化（cookie）
- マニュアル連携機能（Teach me Biz CSV取込・自動紐付け）
- ブランド機能（CoCo壱・ラーメン大戦争・flax&BEAUTY）
- GitHub Actions 自動バックアップ & 復元テスト

---

## 🚧 今後の課題（権限周り以外）

- /admin/employees のパフォーマンス（大規模時のJOIN負荷）
- Supabase Storage 導入時のバックアップ対応
- 監査ログ（admin_audit_log）の拡充（チーム削除・認定取消など）
- Teach me Biz 検索API 連携（契約後）
- `employee-career-card.tsx` のロール変更UIと新 `EmployeePermissionEditor` が二重に存在している（Phase 5 で整理）

---

## 📌 現在の git 状態
- main ブランチ
- 最新コミット: `5af6c17`（Phase 3）
- origin/main と同期済み
