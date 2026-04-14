# 作業再開メモ（2026-04-15 時点）

## 🔄 進行中の検討: 権限モデル再設計

### 背景
- メイトさん（女将）が育成リーダーをやるケースが出た
- 現在の `employees.role` カラムが「業務上の役職」と「システム権限」を混同している
- この混同により、メイト+女将+育成リーダー のような組み合わせが表現できない

### 合意済みの方向性（実装前・要最終確認）
3つの直交した属性に分離する：

1. **`employment_type`**（既存・継続）: `社員` | `メイト`
2. **`business_role_ids`**（新規・配列）: マスタテーブル参照
   - 初期データ: 役員 / 部長 / MG / 店長 / 女将 / 育成担当
   - 複数持てる（例: 店長＋育成担当）
3. **`system_permission`**（新規・単一値）:
   - `developer` | `ops_admin` | `training_leader` | `training_member`
   - 業務役職とは完全独立

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

### 再開時の TODO: ユーザーへの確認事項（5点）
前回提案への返答待ち:
1. 業務役職は将来増えますか？ → マスタ管理 vs enum の判断
2. 「育成担当」はチーム単位の概念ではないですか？ → グローバル属性 vs team レベル
3. 既存社員のシステム権限初期値は移行マッピング表でOKですか？
4. 業務役職の手動設定は運営管理者 + 開発者 限定でOKですか？
5. 既存のロール表記（管理者 / マネジャー等）の統一方針は？

→ ユーザーの回答次第で Phase 1 に着手

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
