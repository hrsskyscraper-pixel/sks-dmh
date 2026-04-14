# バックアップ テスト実行 クイックガイド

## 🧪 手動テスト実行

### Step 1: Actions タブを開く
https://github.com/hrsskyscraper-pixel/sks-dmh/actions

### Step 2: ワークフロー選択
左サイドバーから **「Database Backup」** をクリック

### Step 3: 手動実行
1. 右上あたりに表示される **「Run workflow」** 青ボタンをクリック
2. プルダウンで Branch: `main` を選択（デフォルトでOK）
3. もう一度 **「Run workflow」** ボタン をクリック

### Step 4: 実行中の確認
- ページをリロードすると、実行中のジョブが黄色い●で表示される
- ジョブをクリックすると各ステップの進行状況が見られる
- 所要時間: 2〜5分程度

### Step 5: 成功確認
全ステップに緑✅が付けば成功。
バックアップリポジトリを確認：
👉 https://github.com/hrsskyscraper-pixel/sks-dmh-backups

以下のファイルが増えていれば完璧：
```
daily/
  ├─ db-20260414-XXXXXX.dump.enc   ← 暗号化バックアップ
  └─ schema-20260414-XXXXXX.sql    ← スキーマ
LATEST.md                          ← 最新情報
```

---

## ❌ 失敗時のトラブルシュート

赤❌のステップをクリックするとログが読めます。

| エラー内容 | 対処 |
|---|---|
| `pg_dump: could not connect` または `authentication failed` | `DATABASE_URL` のパスワード部分を再確認 |
| `remote: Permission denied` | PAT に Contents: Read/Write 権限があるか確認 |
| `bad decrypt` または openssl エラー | `BACKUP_PASSPHRASE` の値を再確認 |
| `Repository not found` | `BACKUP_REPO` の値が `hrsskyscraper-pixel/sks-dmh-backups` と完全一致か |
| Python/pg_dump 関連のエラー | 一度Actions から再実行で直ることがある |

---

## 🔐 Secrets の再確認

https://github.com/hrsskyscraper-pixel/sks-dmh/settings/secrets/actions

以下4つが登録されているべき（値は見えなくてOK、名前だけ確認）：
- ✅ `DATABASE_URL`
- ✅ `BACKUP_REPO`
- ✅ `BACKUP_REPO_PAT`
- ✅ `BACKUP_PASSPHRASE`

間違って登録した場合は、該当項目の「Update」ボタンで値を修正可能。

---

## 💡 その後の自動実行

手動テストが成功すれば、以降は **毎日 JST 03:00 に自動実行** されます。
定期的に Actions タブで失敗がないかチェックしてください（週1回程度）。
