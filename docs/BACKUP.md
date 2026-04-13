# データベースバックアップ運用ガイド

Growth Driver（sks-dmh）のデータベース（Supabase PostgreSQL）を、
GitHub Actions で毎日自動バックアップし、**別の非公開リポジトリ**に暗号化保存する仕組みです。

## 🗂 構成

```
sks-dmh（本リポジトリ）
  └─ .github/workflows/backup-db.yml  ← 毎日03:00 JSTに実行

sks-dmh-backups（別の非公開リポジトリ）  ← 要事前作成
  └─ daily/
       ├─ db-20260414-030000.dump.enc   （暗号化ダンプ）
       ├─ schema-20260414-030000.sql    （スキーマのみ・参考用）
       └─ ...（30日分をローテーション）
  └─ LATEST.md（最新バックアップ情報）
```

## ✅ 初期セットアップ（一度だけ実施）

### Step 1: バックアップ用リポジトリを作成

1. GitHub で **Private** リポジトリを新規作成
   - 推奨名: `sks-dmh-backups`
   - 作成者: `hrsskyscraper-pixel`
   - 初期化: README のみで OK

### Step 2: バックアップパスフレーズを決める

強固なパスフレーズを生成・記録（**絶対に紛失しないこと**）：

```bash
# 生成例（macOS）
openssl rand -base64 32
```

> 出力例: `A7xK3pQ9mZ4vR2nL8sT1yW5jH6cN0bE=`

このパスフレーズは以下の3箇所で同じ値を使います：
- GitHub Secrets（`BACKUP_PASSPHRASE`）
- 復元時の入力
- 運営者の手元での保管（パスワードマネージャ等）

### Step 3: バックアップリポジトリ書き込み用 PAT を発行

1. GitHub → Settings → Developer settings → **Personal access tokens → Fine-grained tokens**
2. 「Generate new token」
3. 設定:
   - Token name: `sks-dmh-backup-bot`
   - Expiration: 1年（期限切れ前に更新）
   - Repository access: **Only select repositories** → `sks-dmh-backups` を選択
   - Repository permissions:
     - **Contents: Read and write**
   - それ以外は No access
4. 生成されたトークンをコピー（ `github_pat_...` 形式）

### Step 4: Supabase の DATABASE_URL を取得

1. Supabase ダッシュボード → プロジェクト選択
2. Project Settings → **Database** → **Connection string**
3. **Session Pooler** のタブを選択（pg_dump互換性のため推奨）
4. 表示された URL をコピー。形式:
   ```
   postgresql://postgres.wiwudtwoospratlezhuf:<YOUR-PASSWORD>@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
   ```
5. `<YOUR-PASSWORD>` を実際のDBパスワードに置換

### Step 5: GitHub Secrets に登録

本リポジトリ（sks-dmh）の Settings → **Secrets and variables → Actions** で以下を登録：

| Secret名 | 値 |
|---|---|
| `DATABASE_URL` | Step 4 で取得したフル接続文字列 |
| `BACKUP_REPO` | `hrsskyscraper-pixel/sks-dmh-backups` |
| `BACKUP_REPO_PAT` | Step 3 で発行したトークン |
| `BACKUP_PASSPHRASE` | Step 2 で生成したパスフレーズ |

### Step 6: 手動実行でテスト

1. 本リポジトリの **Actions** タブ → `Database Backup`
2. 「Run workflow」 → `main` ブランチ指定で実行
3. 数分で完了するはず。ログに緑チェックが出ればOK
4. `sks-dmh-backups` リポジトリに `daily/db-*.dump.enc` が追加されているか確認

### Step 7: 復元テスト（強く推奨）

初回は **Supabase ダッシュボードで「テスト用のブランチDB」** を作成し、そこに復元を試してみてください：

```bash
# バックアップファイルをダウンロード後、ローカルで
./scripts/restore-backup.sh db-20260414-030000.dump.enc \
  "postgresql://postgres:xxx@<test-db-url>/postgres"
```

### Step 8: 自動実行の確認

翌朝（JST 03:00〜）、バックアップリポジトリに新しいファイルが増えていれば成功。
Actions タブで実行履歴を確認できます。

---

## 🔧 日常運用

### バックアップの確認
- 定期的（週1回程度）に Actions タブで失敗がないか確認
- もし失敗していたら、ログを確認して対処

### PAT の更新
- PAT は有効期限を設定しているため、1年ごとに Step 3 を再実行して更新

### バックアップ世代
- 直近 30 日分のダンプが `daily/` に保持される
- それより古いものは自動削除
- 特定の時点を永久保存したい場合は、`daily/` → `archive/` に手動で移動するなど

---

## 🚨 復元手順

### シナリオ1: 誤削除（特定のテーブルだけ戻したい）

1. 最新バックアップを `sks-dmh-backups` からダウンロード
2. `pg_restore --data-only --table=<テーブル名>` で部分復元
3. `restore-backup.sh` を改造したスクリプトで実行

### シナリオ2: DBが壊れた（全体復旧）

1. **落ち着く**：データロスが最小になるよう、まず現状の保全を
2. `sks-dmh-backups` から必要な時点のバックアップを選択
3. Supabase で **新しいプロジェクト** を作成（安全のため）
4. `scripts/restore-backup.sh` で新プロジェクトに復元
5. アプリの `NEXT_PUBLIC_SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を新プロジェクトに切替
6. ユーザーには「再ログインをお願いします」と告知（auth は復元されていないため）

```bash
./scripts/restore-backup.sh \
  db-20260414-030000.dump.enc \
  "postgresql://postgres:<new-pass>@<new-host>:5432/postgres"
```

### シナリオ3: 過去のデータを参照したい

1. ローカルのテスト Postgres を起動
2. 復元して内容を確認
3. 本番には触らない

---

## ⚠️ 注意点・制限

1. **auth スキーマは含まれません**
   - ユーザーの認証情報は復元されない
   - 復元後は全員再ログインが必要

2. **Storage（画像等）は含まれません**
   - 本プロジェクトは現在 Supabase Storage 未使用のため影響なし
   - 今後 Storage を使い始めたら、別途対応が必要

3. **RLS ポリシーは復元されます**（public スキーマに含まれるため）

4. **パスフレーズの紛失**
   - 紛失すると暗号化ダンプを復号できません
   - パスワードマネージャ等で安全に管理してください

5. **Supabase 接続失敗**
   - DBパスワード変更時は `DATABASE_URL` secret も更新が必要

---

## 🔄 アップグレードパス

将来的にデータ量・重要度が増したら以下を検討：

- **Supabase Pro プラン**（月 $25）: 公式の自動日次バックアップ + UI復元
- **Supabase Team プラン**（月 $599）: Point-in-Time Recovery（秒単位で復元）
- **Storage バックアップ**: Storage を使い始めたら別workflow追加
