'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TopBar } from '@/components/layout/nav'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  LayoutDashboard, CheckSquare, BadgeCheck, Building2, Users2, Settings,
  Award, MessageCircle, UserPlus, Pencil, Bell, LogIn, Mail,
  ChevronRight, HelpCircle, ShieldCheck, Sparkles, Target, TrendingUp, FileText,
} from 'lucide-react'

// ======================================================================
// 「全体」タブ: 全機能の説明（管理者・開発者向けの詳細）
// ======================================================================
const allSections = [
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
- 招待リンクによるメンバー参加フロー
- メンバーのキャリア記録
- 目標管理
- メール・LINE通知`,
  },
  {
    id: 'login',
    title: 'ログイン・参加',
    icon: LogIn,
    content: `**① 招待リンクから参加（推奨）**
1. 管理者がLINEで招待リンクを送信
2. リンクをタップ → ウェルカムページが表示
3. 「Googleでログインして参加」をタップ
4. Googleアカウントでログイン
5. 氏名・ふりがな・SNSリンク（任意）を入力して「参加する」
6. LINE連携を推奨 → ワンタップで連携
7. ダッシュボード表示、すぐ使える

**② 直接Googleログイン（管理者承認が必要）**
1. アプリURLを直接開く → Googleログイン
2. 参加依頼画面で店舗・チーム選択
3. 管理者の承認待ち
4. 承認されるとメール/LINE通知が届く

**LINE連携**
- ログイン後、画面下部に「LINE連携で通知を受け取る」ボタンが表示
- ダッシュボード上部「LINE通知を受け取れます」バナーからも連携可能
- 認定結果・コメント・招待などが LINE にリアルタイムで届く`,
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

**プロジェクト切替**
- 複数のプロジェクトに参加している場合、上部ボタンで切替
- 選択したプロジェクトに応じて、スキル件数・認定済み数が変化

**お知らせ**
- スキルが認定/差し戻しされた通知
- 差し戻しの場合は「再申請」ボタンから直接再申請へ

**対応が必要です**（店長以上）
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
3. チームのリーダー（店長以上）にメール・LINE通知が届く
4. リーダーが承認センターで認定 or 差し戻し
5. 結果がメール・LINEで届く

**対話履歴**
- 申請中・差し戻し・承認済のカードをタップすると、LINE風の対話履歴が表示
- 申請 → 差し戻し → 再申請 → 認定 の全やりとりを確認できます`,
  },
  {
    id: 'approvals',
    title: '承認センター',
    icon: BadgeCheck,
    content: `全ての承認待ち案件を1画面で管理できます。（店長以上）

**タブ構成**
| タブ | 内容 |
|------|------|
| すべて | 全種類の承認待ちを新しい順に表示 |
| スキル認定 | スキル認定の申請一覧。「認定」「戻す」で操作 |
| チーム変更 | チーム変更申請。「承認」「却下」 |
| 参加許諾 | 新規メンバーの参加依頼。店舗・チーム・ロールを設定して承認 |
| 処理済み | 自分が処理した認定/差し戻しの履歴 |

**スキル認定の操作**
- カードをタップ → 対話履歴を確認
- 履歴の末尾に「認定」「戻す」ボタン
- コメントを添えて認定/差し戻し
- 申請者にメール・LINE通知が届く`,
  },
  {
    id: 'invite',
    title: 'メンバー招待',
    icon: Mail,
    content: `チーム画面から、新しいメンバー・リーダーを招待できます。（店長以上）

**招待方法**
- チーム画面 → チームを展開 → メンバー欄 / 担当リーダー欄の「✉招待」ボタン
- 2種類のモードから選択

**① メンバーに送る（既存の社員宛）**
- 登録済みメンバーから選んで送信
- メール＋LINE（連携済みなら）で通知

**② リンクを発行（LINEで新規の人にも）**
- リンクを発行 → 「LINEで送る」で共有
- 「案内文をコピー」で案内文+URLを一括コピーも可
- 受信者はウェルカムページ → Googleログイン → 自動で参加完了

**リーダーとして招待**
- 担当リーダー欄の招待ボタンを使うと、参加時にリーダーとして加入
- 既にメンバーだった場合はリーダーに昇格

**ウェルカムページのプレビュー**
- 招待発行後、「ウェルカムページを確認する」ボタンで
  招待先にどう見えるかをプレビュー可能`,
  },
  {
    id: 'teams',
    title: 'チーム',
    icon: Building2,
    content: `チーム・部署・店舗の一覧と管理画面です。

**自分の所属**
- 画面上部に自分が所属するチーム・部署・店舗をまとめて表示
- タップで展開してメンバー・リーダーを確認
- メンバー欄・担当リーダー欄をそれぞれ色分け（グレー/アンバー）で区別
- 各欄の「✉招待」ボタンから直接招待を発行できる

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
    title: '仲間（メンバー一覧）',
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

**編集**（運用管理者以上、または店長・マネジャーが自チームメンバー）
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
| 入社 | 入社日の記録（最も古い日付がプロフィールの入社日に） |
| 配属・異動 | 配属先・異動先 |
| 育成 | 育成に関する記録 |
| 役職 | 役職名（最新のものがプロフィールに表示） |
| 資格 | 社内資格（プルダウン）または社外資格（自由入力） |
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
- スキル割当（ドラッグ&ドロップでフェーズ変更）
- 未割当エリア: 他プロジェクトで使用中のスキルはプロジェクト名で折りたたみ
  （新規登録対象が見やすい）
- **CSV一括登録**: テンプレートDL → 編集 → アップロード でスキルを一括追加

**CSV取込（勤務時間）**
- 勤務時間データの一括インポート

**社内資格マスタ**
- 社内資格の追加・編集・削除
- アイコン（資格 / 星）と色（8色）の選択`,
  },
  {
    id: 'roles',
    title: 'ロールと権限',
    icon: Award,
    content: `以下の表で、各ロールができること・できないことを確認できます。

**記号の意味**
- ◯：できる
- △：自チーム・自店舗のメンバーのみなど限定的にできる
- ✕：できない

**スキル**
| 機能 | メイト | 社員 | 店長 | マネ | 運管 | 役員 | 開発 |
|---|---|---|---|---|---|---|---|
| 自分のスキル閲覧・申請 | ◯ | ◯ | ◯ | ◯ | ◯ | ◯ | ◯ |
| 他メンバーのスキル閲覧 | ✕ | ✕ | △ | △ | ◯ | ◯ | ◯ |
| スキル認定・差し戻し | ✕ | ✕ | △ | △ | ◯ | ◯ | ◯ |

**参加承認・チーム変更・招待**
| 機能 | メイト | 社員 | 店長 | マネ | 運管 | 役員 | 開発 |
|---|---|---|---|---|---|---|---|
| 参加申請の承認 | ✕ | ✕ | △ | △ | ◯ | ◯ | ◯ |
| 招待リンクの発行 | ✕ | ✕ | ◯ | ◯ | ◯ | ◯ | ◯ |
| チーム変更の申請 | ✕ | ✕ | ◯ | ◯ | ◯ | ◯ | ◯ |
| チーム変更の承認 | ✕ | ✕ | △ | △ | ◯ | ◯ | ◯ |

**メンバー・チーム管理**
| 機能 | メイト | 社員 | 店長 | マネ | 運管 | 役員 | 開発 |
|---|---|---|---|---|---|---|---|
| 自分のプロフィール編集 | ◯ | ◯ | ◯ | ◯ | ◯ | ◯ | ◯ |
| 他メンバーのプロフィール編集 | ✕ | ✕ | △ | △ | ◯ | ◯ | ◯ |
| メンバー名編集 | ✕ | ✕ | ✕ | ✕ | ◯ | ◯ | ◯ |
| メンバーのロール変更 | ✕ | ✕ | △ | △ | ◯ | ◯ | ◯ |
| チーム作成・編集・削除 | ✕ | ✕ | 申請 | 申請 | ◯ | ◯ | ◯ |

**設定・その他**
| 機能 | メイト | 社員 | 店長 | マネ | 運管 | 役員 | 開発 |
|---|---|---|---|---|---|---|---|
| 設定画面へのアクセス | ✕ | ✕ | ✕ | ✕ | ◯ | ◯ | ◯ |
| プロジェクト管理（CSV一括登録含む） | ✕ | ✕ | ✕ | ✕ | ◯ | ◯ | ◯ |
| 勤務時間CSV取込 | ✕ | ✕ | ◯ | ◯ | ◯ | ◯ | ◯ |
| 社内資格マスタ管理 | ✕ | ✕ | ✕ | ✕ | ◯ | ◯ | ◯ |

※「マネ」＝マネジャー、「運管」＝運用管理者、「開発」＝開発者`,
  },
  {
    id: 'notifications',
    title: '通知',
    icon: Bell,
    content: `**メール通知**
- スキル申請/再申請時 → チームのリーダー（店長以上）に通知
- スキル認定/差し戻し時 → 申請者に通知
- 参加依頼時 → 希望店舗の店長・管理者に通知
- 招待受信時 → 対象メンバーに通知（既存メンバー宛）
- 参加承認時 → 申請者に通知（メール。LINE連携済みならLINEも）

**LINE通知**
- メール通知と同じタイミングで LINE にも通知（連携済みの場合）
- LINE未連携時は、画面下部の「LINE連携で通知を受け取る」ボタンで設定可能

**アプリ内通知**
- ダッシュボードの「お知らせ」セクション
- 通知ベル（ヘッダー右上）`,
  },
]

// ======================================================================
// 「育成メンバー向け」タブ
// ======================================================================
const memberSections = [
  {
    id: 'm-welcome',
    title: 'Growth Driver へようこそ',
    icon: Sparkles,
    content: `このアプリは、あなたのスキル習得を"見える化"して、チームで応援しあうためのものです。

**あなたがここでできること**
- できるようになったスキルを申請 → リーダーが認定
- 自分の進捗が"順調？遅れてる？"がわかる
- 仲間の頑張り・進捗が見える
- タイムラインで応援・祝福・感謝を交換`,
  },
  {
    id: 'm-start',
    title: '最初の参加のしかた',
    icon: LogIn,
    content: `**招待リンクをLINE等で受け取ったら**

1. リンクをタップするとウェルカムページが開きます
2. 内容を確認し「Googleでログインして参加」をタップ
3. Googleアカウントでログイン（個人アカウントでOK）
4. 氏名・ふりがなを確認
   - アルファベットではなく、**漢字・ひらがな・カタカナ**で入力
5. SNSリンク（Instagram・LINE）を入力（任意・推奨）
   - 「確認方法」リンクで取得方法がわかります
6. 「参加する」で完了！

**LINE連携は必ず設定しましょう**
参加直後に「LINE連携する（推奨）」が表示されます。一度設定すれば、認定結果や仲間からのコメントが**LINEに届く**ようになります。

スキップしても、画面下部に「LINE連携で通知を受け取る」ボタンが常に表示されるので、あとからでも設定できます。`,
  },
  {
    id: 'm-skill',
    title: 'スキルを申請する（一番よく使う機能）',
    icon: CheckSquare,
    content: `**基本の流れ**
1. 下部ナビの「**スキル**」タブを開く
2. 「**未申請**」タブでチャレンジしたいスキルを探す
3. スキル名の横の「**申請する**」ボタンをタップ
4. コメント欄に「こんなお客様に対応できました」など一言を添える（任意）
5. 送信すると、リーダーに通知が届きます

**認定待ち・結果の確認**
- 申請直後は「**申請中**」タブに入ります
- リーダーが認定すると「**承認済**」タブへ、結果通知が届きます
- 戻された場合は「**差し戻し**」タブに。理由を確認して再申請できます

**ダッシュボードの「次のステップ」**
次に取り組むべき優先スキルは、育成リーダーと相談して決めましょう。

特に、優先すべきスキルがない場合などは、ダッシュボードに今取り組むべきスキルが自動表示されています。迷ったらここからチャレンジするのが◎`,
  },
  {
    id: 'm-progress',
    title: '自分の進捗を確認する',
    icon: LayoutDashboard,
    content: `**ダッシュボード（ホーム）で一覧できます**
- 全体達成率: 全スキルに対する認定済みの割合
- 認定済み / 申請中 / 差し戻し / 未申請 の件数
- 進捗バー: 今の達成率が"標準進捗"と比べてどうか

**プロジェクトを切り替える**
複数のプロジェクトに参加している人は、上部のプロジェクト名ボタンで切り替え可能。`,
  },
  {
    id: 'm-next',
    title: '次にチャレンジするスキルを知る',
    icon: TrendingUp,
    content: `ダッシュボードの「**次のステップ**」セクションで、今あなたが取り組むべきスキルが自動で表示されます。

**見方**
- 現在のフェーズで未申請のスキルが表示される
- **赤色**: 標準より遅れているスキル（優先度高）
- **青色**: ちょうど今取り組むべきスキル
- カードをタップすると、スキルの詳細や申請画面へ

**使い方のコツ**
迷ったら「次のステップ」の上から順にチャレンジするのが◎。
何を練習すればよいか悩む時間を減らし、成長に集中できます。`,
  },
  {
    id: 'm-goal',
    title: '目標を設定する',
    icon: Target,
    content: `自分の中期目標を設定して、キャリア記録に残しておくと、ダッシュボードに常に表示され、迷った時の道しるべになります。

**設定方法**
1. ダッシュボードの「**目標を設定する**」ボタン
   または 下部ナビ「My」→「Myキャリア」→「キャリア記録」→「追加」
2. 種別で「**目標**」を選択
3. 入力項目
   - **目標期日**: いつまでに達成したいか
   - **目標内容**: 何を達成したいか（例: 「店長候補として認められる」）
   - **理由/目的**: なぜその目標を立てたか（モチベーション維持に重要）

**表示される場所**
- ダッシュボードのウェルカムカード内に、期日が一番近い目標が表示
- リーダーとの面談時の話題にもなります

達成したら新しい目標を追加しましょう。過去の目標は履歴として残ります。`,
  },
  {
    id: 'm-career',
    title: 'キャリアの記録を見る',
    icon: FileText,
    content: `下部ナビ「**My**」→「**Myキャリア**」で、あなたの歩みが記録された「キャリア記録」を確認できます。

**記録される種別**
- **入社**: 入社日
- **配属・異動**: 配属店舗・異動の履歴
- **役職**: 役職の変遷（最新がプロフィールに表示）
- **資格**: 取得した社内・社外資格
- **目標**: 自分で設定した目標（上記参照）
- **育成**: リーダーが記録する育成の足跡
- **面接・採用**: 入社までの経緯

**メンバーができること**
- **自分の記録の閲覧**
- **目標の追加・編集**（自分自身の目標のみ）
- プロフィール情報の編集

**記録の作成・編集**（育成・役職・資格など）は主にリーダー・管理者が行います。
記録に間違いがあればリーダーに相談してください。`,
  },
  {
    id: 'm-timeline',
    title: 'タイムラインで仲間と交流',
    icon: MessageCircle,
    content: `下部ナビ「**TL**」タブでタイムラインが見られます。

**できること**
- 仲間がスキル認定された時の投稿が見える
- スタンプで応援・祝福・感謝を気軽に伝える
- コメントで励ましや質問

相互理解とモチベーションアップにぜひご活用ください。`,
  },
  {
    id: 'm-myprofile',
    title: 'プロフィールを整える',
    icon: Pencil,
    content: `下部ナビの右下「**My**」をタップし、「**Myキャリア**」からプロフィールを編集できます。

**編集できる項目**
- 氏名・ふりがな
- 生年月日・入社日
- Instagram URL / LINE URL
- アバター写真（タップしてアップロード）

SNSリンクを入れると、他のメンバーからアイコンで繋がれるので相互理解が深まります。`,
  },
  {
    id: 'm-help',
    title: '困った時は',
    icon: HelpCircle,
    content: `- このガイドをいつでも見られます（下部ナビ「My」→「使い方ガイド」）
- リーダー・仲間に気軽に声をかける
- 通知が届かない → LINE連携を確認（画面下部のボタン）
- ログインできない → ブラウザをSafari / Chrome に変えて試す`,
  },
]

// ======================================================================
// 「育成リーダー向け」タブ
// ======================================================================
const leaderSections = [
  {
    id: 'l-role',
    title: 'リーダーの役割',
    icon: ShieldCheck,
    content: `育成リーダーは、メンバーの成長を後押しする大切な役割です。

**主な仕事**
- メンバーのスキル申請を **認定する**（または戻して指導）
- メンバーを **招待してチームに加える**
- チーム全体の進捗を把握する
- タイムラインで応援・励まし

**はじめの一歩**
1. 招待リンクから参加（ウェルカム→Google→氏名確認）
2. **LINE連携は最優先** — 通知を逃さないために必須レベルです`,
  },
  {
    id: 'l-invite',
    title: 'メンバーを招待する',
    icon: Mail,
    content: `**招待の方法（LINEで送る場合が一般的）**

1. 下部ナビの「**チーム**」タブ
2. 自分のチームを展開 → 「メンバー」欄の右「**✉招待**」ボタン
3. タブ「**リンクを発行**」を選択
4. メッセージを入力（任意。「〇〇さん、一緒に頑張りましょう！」など）
5. 「**リンクを発行**」ボタン
6. 「**LINEで送る**」ボタンでワンタップ送信
   - または「案内文をコピー」して別のメッセージに貼り付け

**受信者の体験**
- LINEのリンクをタップ → 外部ブラウザでウェルカムページ表示
- Googleでログイン → 氏名・ふりがな入力 → 参加完了
- 自動的に承認されるので、**リーダーの追加承認は不要**

**既存メンバーへの招待（別チームへの追加）**
- 「メンバーに送る」タブで、既に登録済みの社員を選んで招待
- 相手にはメール・LINEで通知

**リーダーとして招待する**
- チーム展開 → 「**担当リーダー**」欄の右「✉招待」ボタン
- 参加時に自動的にリーダーとして加入
- すでにメンバーだった人は、メンバーから外れてリーダーに昇格

**送る前に内容を確認したい**
- 招待発行後の画面で「**ウェルカムページを確認する**」をタップ
- 受信者にどう見えるかをプレビューできます`,
  },
  {
    id: 'l-approval',
    title: 'スキル認定（最重要）',
    icon: BadgeCheck,
    content: `**認定の流れ**

1. メンバーがスキルを申請すると、LINE/メールで通知が届く
2. 下部ナビ「**承認**」タブ（赤いバッジで件数表示）
3. 「**スキル認定**」タブで申請カード一覧
4. カードをタップして **対話履歴** を確認
   - 申請者のコメント、以前の差し戻し履歴など
5. 「**認定**」または「**戻す**」ボタンをコメント付きで操作
   - 認定: メンバーに達成感と次へのモチベーション
   - 戻す: 理由を優しく丁寧に（例: "〇〇の部分を確認してみてください"）

**認定の判断基準**
- できたことを**肯定的に**評価する姿勢で
- 求められる水準に達していなければ戻すことも大切
- コメントは具体的に（何が良かったか / 次はどこを）

**メンバーには結果が即通知される**
- メール・LINE（連携済み）
- アプリ内通知ベルにも表示`,
  },
  {
    id: 'l-progress',
    title: 'チームの進捗を見る',
    icon: Users2,
    content: `**チーム画面で全体を把握**
- 下部ナビ「チーム」→ 自分のチームを展開
- メンバー一覧、担当リーダー一覧が見える
- 各メンバーの認定率もタップすると確認可能

**仲間タブで詳細**
- 下部ナビ「**仲間**」→ フィルタで自分のチームに絞る
- 各メンバーの進捗バー（認定率 vs 標準進捗）
- 遅れている人が一目でわかる

**ダッシュボードのランキング**
- チーム全体の進捗ランキングが表示される
- モチベーション管理に活用`,
  },
  {
    id: 'l-goal',
    title: 'メンバーの目標設定を支援する',
    icon: Target,
    content: `メンバーが自ら「目標」を設定することで、成長の方向性が明確になります。リーダーは面談等で目標設定を促しましょう。

**設定の流れ（メンバーが行う）**
- ダッシュボードの「目標を設定する」ボタン、または Myキャリア → キャリア記録 → 「追加」
- 種別「目標」を選び、期日・目標内容・理由/目的を入力
- ダッシュボードに常に表示される

**リーダーができること**
- メンバーのキャリア記録を開いて、現在の目標を把握
- 1on1で「目標に近づけているか」を話題にする
- 進捗が遅れていれば、一緒に次のアクションを考える

**目標設定の効果**
- メンバーが「何のためにスキル習得するか」を自分の言葉で言語化できる
- リーダーもメンバーの志向性が見えるので、育成が個別最適化しやすい`,
  },
  {
    id: 'l-career',
    title: 'キャリア記録でメンバーを把握',
    icon: FileText,
    content: `メンバーのキャリア記録を残すことで、育成の履歴が蓄積されます。

**アクセス方法**
- 下部ナビ「仲間」→ メンバーをタップ
- 「キャリア記録」セクションで「追加」ボタン

**リーダーが記録できる主な種別**
| 種別 | 使い方の例 |
|---|---|
| 育成 | 1on1での気づき、成長のエピソード |
| 役職 | 役職変更の履歴 |
| 資格 | 社内資格の付与、外部資格の取得記録 |
| 配属・異動 | 配属・異動の履歴（異動理由も記録可能） |

**活用シーン**
- 店長への引き継ぎ時: 過去の育成記録を共有
- 評価面談の事前準備: 成長の軌跡を振り返る
- 目標設定の参考: 過去の関心・強みを踏まえる

※ 記録の編集・削除は運用管理者以上。リーダーは**追加**が中心です。`,
  },
  {
    id: 'l-participation',
    title: '参加承認（Google直接ログインの場合）',
    icon: UserPlus,
    content: `招待リンクからの参加は**承認不要**ですが、アプリURLに直接アクセスして自分で申請してきた場合は承認が必要です。

**承認手順**
1. 下部ナビ「承認」→ 「**参加許諾**」タブ
2. 申請カードの「**確認**」ボタン
3. 店舗・チーム・ロール（メイト/社員）を設定
4. 「承認する」をタップ
5. 本人にメール・LINEで「参加の準備が整いました」通知`,
  },
  {
    id: 'l-line',
    title: '通知を逃さないために',
    icon: MessageCircle,
    content: `リーダーは通知を見逃すとメンバーを待たせてしまいます。以下を徹底しましょう。

**LINE連携（必須）**
- 未連携時は画面下部に「**LINE連携で通知を受け取る**」緑色ボタンが常時表示
- タップ → LINEで認証 → 即完了

**LINEで届く通知（リーダー向け）**
- メンバーからスキル認定の申請が届いた時
- チーム変更の承認依頼
- タイムラインでのリアクション・コメント

**スマホのLINEで招待リンクが開かない場合**
Googleログインは LINE 内ブラウザをブロックします。その場合：
- 送信する招待URLには自動的に \`openExternalBrowser=1\` が付くので、
  LINEが自動的にSafari / Chromeで開いてくれます
- それでも内部で開いてしまった場合は、画面上部の「外部ブラウザで開く」バナーをタップ`,
  },
  {
    id: 'l-daily',
    title: '定期的に気にかけること',
    icon: Bell,
    content: `**毎日（30秒）**
- 下部ナビの「承認」の赤バッジを確認
- 申請があれば認定 or 戻す

**週1回（5分）**
- チーム画面でメンバーの進捗を俯瞰
- 遅れている人がいないかチェック
- タイムラインで応援メッセージを送る

**新しいメンバーが入ったら**
- 必ず声をかける／タイムラインで歓迎
- 最初の数件のスキル申請は素早く認定してモチベーションを上げる`,
  },
]

// ======================================================================
// Helper: Markdown-ish content renderer
// ======================================================================
function renderContent(content: string): React.ReactNode[] {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const trimmed = lines[i].trim()

    // テーブル
    if (trimmed.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().split('|').filter(c => c.trim() !== '').map(c => c.trim())
        if (cells.length > 0 && !cells.every(c => /^-+$/.test(c))) {
          rows.push(cells)
        }
        i++
      }
      if (rows.length > 0) {
        const [header, ...body] = rows
        elements.push(
          <div key={`t${key++}`} className="my-2 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {header.map((cell, j) => (
                    <th
                      key={j}
                      className={`bg-gray-50 px-2 py-1.5 font-medium text-gray-700 border border-gray-200 ${j === 0 ? 'text-left' : 'text-center whitespace-nowrap'}`}
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={`px-2 py-1.5 border border-gray-200 ${
                          j === 0
                            ? 'font-medium text-gray-700 bg-gray-50/50'
                            : 'text-center text-gray-600 whitespace-nowrap'
                        } ${
                          cell === '◯' ? 'text-green-600 font-semibold' :
                          cell === '✕' ? 'text-gray-300' :
                          cell === '△' ? 'text-amber-600 font-semibold' : ''
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // 太字見出し
    if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      elements.push(
        <p key={key++} className="font-semibold text-gray-800 mt-3 mb-1">
          {trimmed.replace(/\*\*/g, '')}
        </p>
      )
    } else if (trimmed.startsWith('- ')) {
      // インライン太字もサポート
      const text = trimmed.slice(2)
      elements.push(
        <p
          key={key++}
          className="pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-orange-400"
        >
          {renderInline(text)}
        </p>
      )
    } else if (/^\d+\./.test(trimmed)) {
      elements.push(<p key={key++} className="pl-4">{renderInline(trimmed)}</p>)
    } else if (!trimmed) {
      elements.push(<div key={key++} className="h-1" />)
    } else {
      elements.push(<p key={key++}>{renderInline(trimmed)}</p>)
    }
    i++
  }
  return elements
}

// **...** をインライン太字として描画
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} className="text-gray-800">{p.slice(2, -2)}</strong>
    }
    return <span key={i}>{p}</span>
  })
}

// 各タブ用のセクションリスト描画
interface Section {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  content: string
}
function SectionList({ sections }: { sections: Section[] }) {
  return (
    <div className="space-y-4">
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
            <div className="prose prose-sm max-w-none text-gray-600 [&_strong]:text-gray-800 whitespace-pre-line">
              {renderContent(s.content)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function HelpContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialTab = (searchParams.get('tab') as 'member' | 'leader' | 'all' | null) ?? 'member'
  const [tab, setTab] = useState<'member' | 'leader' | 'all'>(
    ['member', 'leader', 'all'].includes(initialTab as string) ? initialTab as 'member' | 'leader' | 'all' : 'member'
  )
  const handleTabChange = (v: string) => {
    const next = v as 'member' | 'leader' | 'all'
    setTab(next)
    // URLを書き換え（履歴は残さない）
    router.replace(`/help?tab=${next}`, { scroll: false })
  }
  return (
    <>
      <TopBar title="使い方ガイド" hideNotificationBell />
      <div className="p-4 max-w-2xl mx-auto">
        <Tabs value={tab} onValueChange={handleTabChange} className="mb-4">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="member" className="text-xs">
              <Sparkles className="w-3 h-3 mr-1" />メンバー向け
            </TabsTrigger>
            <TabsTrigger value="leader" className="text-xs">
              <ShieldCheck className="w-3 h-3 mr-1" />リーダー向け
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs">
              <HelpCircle className="w-3 h-3 mr-1" />全体
            </TabsTrigger>
          </TabsList>
          <TabsContent value="member" className="mt-3">
            <SectionList sections={memberSections} />
          </TabsContent>
          <TabsContent value="leader" className="mt-3">
            <SectionList sections={leaderSections} />
          </TabsContent>
          <TabsContent value="all" className="mt-3">
            <SectionList sections={allSections} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

export default function HelpPage() {
  return (
    <Suspense>
      <HelpContent />
    </Suspense>
  )
}
