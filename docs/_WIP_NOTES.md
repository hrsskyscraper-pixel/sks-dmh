# 作業再開メモ（2026-04-15 時点）

## 🔄 進行中の検討: 権限モデル再設計

### 背景
- メイトさん（女将）が育成リーダーをやるケースが出た
- 現在の `employees.role` カラムが「業務上の役職」と「システム権限」を混同している
- この混同により、メイト+女将+育成リーダー のような組み合わせが表現できない

### 確定済みの方針（2026-04-15 合意）
3つの直交した属性に分離する：

1. **`employment_type`**（既存・継続）: `社員` | `メイト`
2. **`business_role_ids`**（新規・配列）: マスタテーブル参照（将来増える前提）
   - 初期データ: 役員 / 部長 / MG / 店長 / 女将 / 育成担当
   - 複数持てる（例: 店長＋育成担当）
   - 「育成担当」は人に対する属性。チームとの紐付けは team_members 経由で間接的
3. **`system_permission`**（新規・単一値）: `developer` | `ops_admin` | `training_leader` | `training_member`
   - 業務役職とは独立。業務役職保有による自動付与はしない
   - 但し、新規作成/移行時のデフォルト初期値として下記 B のルールを適用

### UIラベル（確定）
**業務役職**: 役員 / 部長 / MG / 店長 / 女将 / 育成担当
**システム権限**:
- `developer` → 開発者
- `ops_admin` → 運用管理者
- `training_leader` → リーダー
- `training_member` → メンバー

### デフォルトのシステム権限ルール
A. 業務役職保有者のデフォルト → **リーダー**（役員/部長/MG/店長/女将/育成担当 いずれか保有）
B. 業務役職なし → **メンバー**
C. `開発者` / `運用管理者` は個別手動設定のみ（デフォルト付与なし）
D. 業務役職の手動設定は `運用管理者` + `開発者` のみ可能

### 現行 role からの移行マッピング
| 現 role | system_permission | business_roles の例 |
|---|---|---|
| admin | developer | （任意） |
| ops_manager | ops_admin | 部長 |
| executive | ops_admin | 役員 |
| manager | training_leader | MG |
| store_manager | training_leader | 店長 |
| employee | training_member | （任意） |
| testuser | developer | （任意） |

### 実装計画（5フェーズ・合計 1週間の目安）
1. **Phase 1**: マイグレーション（business_roles テーブル + 2カラム追加 + データ移行）
2. **Phase 2**: 互換性レイヤ（ヘルパー関数で新旧両対応）
3. **Phase 3**: 権限チェック置換（30-50箇所、ファイル単位で段階的）
4. **Phase 4**: UI 更新（ブランド管理 → 「ブランド・店舗・部署・役職管理」、複数役職表示）
5. **Phase 5**: 旧 role カラム廃止（任意）

### 確認事項への回答（2026-04-15 確定）
1. 業務役職は将来増える → **マスタテーブル化**
2. 育成担当は人に対する属性（チームは team_members 経由で間接紐付け）
3. 移行マッピング表でOK
4. 手動設定は運用管理者 + 開発者のみ
5. ラベルは上記「UIラベル」セクション参照

→ Phase 1 マイグレーション着手可

---

## 📝 直近の実装履歴（時系列逆順）

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

## 🔧 技術メモ

### 関連コード位置
- 権限チェック: `src/app/(dashboard)/**/page.tsx`, `src/app/api/**/route.ts`, `src/app/(dashboard)/**/actions.ts`
- ロール型定義: `src/types/database.ts` → `export type Role`
- employees テーブル: migration `20250101000001_initial_schema.sql`
- 権限ヘルパー関数は未整備（現状は各ファイルで inline チェック）

### 権限チェックが存在する主要箇所の目安
- api/approval/route.ts (APPROVAL_ROLES)
- api/certify-skill/route.ts
- invite/actions.ts (INVITER_ROLES)
- admin/brands/actions.ts (ADMIN_ROLES)
- admin/manuals/actions.ts
- admin/projects/page.tsx
- admin/teams/page.tsx
- team-manager.tsx の canDirectEdit
- (dashboard)/layout.tsx
- 各管理ページの権限ガード

### 直接 `.role` を検索すれば全箇所洗い出せる
```bash
grep -r "\.role\b\|'admin'\|'ops_manager'\|'executive'" src/ | grep -v node_modules
```

---

## 🚧 今後の課題（権限周り以外）

- /admin/employees のパフォーマンス（大規模時のJOIN負荷）
- Supabase Storage 導入時のバックアップ対応
- 監査ログ（admin_audit_log）の拡充（チーム削除・認定取消など）
- Teach me Biz 検索API 連携（契約後）

---

## 📌 現在の git 状態
- main ブランチ
- origin/main と同期済み
- 未コミットの変更なし（再起動後は `git status` で確認）
