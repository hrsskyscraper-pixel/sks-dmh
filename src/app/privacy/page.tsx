import Link from 'next/link'

export const metadata = {
  title: 'プライバシーポリシー | Growth Driver',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm p-6 md:p-10">
        <header className="mb-8 border-b border-gray-200 pb-6">
          <Link href="/" className="text-sm text-orange-600 hover:underline">← ホームへ戻る</Link>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mt-2">プライバシーポリシー</h1>
          <p className="text-xs text-gray-500 mt-2">最終更新日: 2026年4月13日</p>
        </header>

        <div className="prose prose-sm md:prose-base max-w-none text-gray-700 space-y-6 leading-relaxed">
          <p>
            Growth Driver（以下「本サービス」といいます）は、ユーザーの個人情報の保護を重要視し、
            個人情報の保護に関する法律（個人情報保護法）を遵守します。本プライバシーポリシーは、
            本サービスにおける個人情報の取扱いについて定めるものです。
          </p>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">1. 取得する情報</h2>
            <p>本サービスは、以下の情報を取得します。</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>氏名、メールアドレス、プロフィール画像</li>
              <li>Googleアカウント連携時に取得される情報（氏名、メールアドレス、プロフィール画像）</li>
              <li>LINEアカウント連携時に取得される情報（LINEユーザーID、表示名）</li>
              <li>所属チーム・店舗・部署情報、役職、入社日、生年月日</li>
              <li>スキル習得状況、認定履歴、勤務時間、キャリア記録</li>
              <li>本サービス内での操作ログ、アクセス日時、IPアドレス、デバイス情報</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">2. 利用目的</h2>
            <p>取得した情報は、以下の目的のために利用します。</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>本サービスの提供、運営、保守</li>
              <li>ユーザー認証、ログイン管理</li>
              <li>スキル習得進捗の管理・可視化</li>
              <li>メール・LINE等による通知（申請受付、承認結果、招待等）</li>
              <li>本サービスの改善、新機能開発のための統計分析</li>
              <li>不正利用の防止、セキュリティ確保</li>
              <li>お問い合わせへの対応</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">3. 第三者提供</h2>
            <p>
              本サービスは、法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供しません。
              ただし、以下の場合は除きます。
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>法令に基づく開示要請があった場合</li>
              <li>人の生命、身体または財産の保護のために必要がある場合</li>
              <li>サービス運営に必要な業務を委託する場合（委託先には適切な監督を行います）</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">4. 外部サービスの利用</h2>
            <p>本サービスは、以下の外部サービスを利用しています。各サービスのプライバシーポリシーも合わせてご確認ください。</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Google（認証、メール送信）</li>
              <li>LINE（ログイン、通知配信）</li>
              <li>Supabase（データベース・認証基盤）</li>
              <li>Vercel（ホスティング）</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5. 情報の保存期間</h2>
            <p>
              取得した個人情報は、利用目的の達成に必要な期間、または法令で定められた期間保存します。
              保存期間を過ぎた情報は、適切な方法で削除または匿名化します。
              ユーザーが退会・削除を希望する場合は、運営者までご連絡ください。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">6. セキュリティ</h2>
            <p>
              本サービスは、個人情報の漏洩、改ざん、不正アクセス等を防止するため、
              適切な技術的・組織的安全管理措置を講じます。通信はSSL/TLSにより暗号化しています。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7. ユーザーの権利</h2>
            <p>
              ユーザーは、自己の個人情報について、開示、訂正、削除、利用停止を求めることができます。
              ご希望の場合は、下記お問い合わせ先までご連絡ください。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">8. Cookie の利用</h2>
            <p>
              本サービスは、ユーザー認証の維持およびサービス改善のために Cookie を使用します。
              ブラウザの設定により Cookie を無効化できますが、一部機能がご利用いただけない場合があります。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">9. 本ポリシーの変更</h2>
            <p>
              本サービスは、必要に応じて本プライバシーポリシーを改定することがあります。
              重要な変更がある場合は、本サービス内でお知らせします。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">10. お問い合わせ窓口</h2>
            <p>
              本プライバシーポリシーに関するお問い合わせは、以下の窓口までご連絡ください。
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mt-2">
              <p className="text-sm">運営者: Growth Driver 運営チーム</p>
              <p className="text-sm">メール: hrs.skyscraper@gmail.com</p>
            </div>
          </section>
        </div>

        <footer className="mt-10 pt-6 border-t border-gray-200 text-xs text-gray-500 text-center">
          <Link href="/terms" className="hover:underline mr-4">利用規約</Link>
          <Link href="/" className="hover:underline">Growth Driver</Link>
        </footer>
      </div>
    </div>
  )
}
