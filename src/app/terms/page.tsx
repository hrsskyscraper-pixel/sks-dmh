import Link from 'next/link'

export const metadata = {
  title: '利用規約 | Growth Driver',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm p-6 md:p-10">
        <header className="mb-8 border-b border-gray-200 pb-6">
          <Link href="/" className="text-sm text-orange-600 hover:underline">← ホームへ戻る</Link>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mt-2">利用規約</h1>
          <p className="text-xs text-gray-500 mt-2">最終更新日: 2026年4月13日</p>
        </header>

        <div className="prose prose-sm md:prose-base max-w-none text-gray-700 space-y-6 leading-relaxed">
          <p>
            本利用規約（以下「本規約」といいます）は、Growth Driver（以下「本サービス」といいます）
            の利用条件を定めるものです。ユーザーは本規約に同意の上で本サービスを利用するものとします。
          </p>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">第1条（適用）</h2>
            <p>
              本規約は、本サービスの提供条件および運営者とユーザーとの間の権利義務関係を定めるものであり、
              ユーザーと運営者との間の本サービス利用に関わる一切の関係に適用されます。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">第2条（利用登録）</h2>
            <ol className="list-decimal pl-6 space-y-1">
              <li>本サービスの利用を希望する方は、本規約に同意の上、運営者の定める方法により利用登録を申請し、運営者の承認を得るものとします。</li>
              <li>運営者は、申請者に以下の事由があると判断した場合、利用登録の申請を承認しないことがあります。
                <ul className="list-disc pl-6 mt-1">
                  <li>虚偽の情報を申請した場合</li>
                  <li>過去に本規約違反があった場合</li>
                  <li>その他、運営者が登録を相当でないと判断した場合</li>
                </ul>
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">第3条（アカウント管理）</h2>
            <ol className="list-decimal pl-6 space-y-1">
              <li>ユーザーは、自己の責任において本サービスのアカウントを管理するものとします。</li>
              <li>アカウントの不正利用、第三者への譲渡・貸与等は禁止します。</li>
              <li>ユーザーのアカウントによってなされた行為は、すべて当該ユーザーによる行為とみなします。</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">第4条（禁止事項）</h2>
            <p>ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>法令または公序良俗に違反する行為</li>
              <li>犯罪行為に関連する行為</li>
              <li>本サービスの運営を妨害する行為</li>
              <li>他のユーザーまたは第三者の権利・利益を侵害する行為</li>
              <li>本サービスのネットワークまたはシステムに過度な負荷をかける行為</li>
              <li>本サービスのリバースエンジニアリング、不正アクセスの試み</li>
              <li>虚偽の情報を登録・投稿する行為</li>
              <li>その他、運営者が不適切と判断する行為</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">第5条（本サービスの提供の停止等）</h2>
            <p>運営者は、以下のいずれかに該当する場合、ユーザーへの事前通知なく本サービスの全部または一部の提供を停止または中断できるものとします。</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>本サービスの保守点検または更新を行う場合</li>
              <li>地震、落雷、火災、停電、天災等の不可抗力により提供が困難となった場合</li>
              <li>コンピュータまたは通信回線等が事故により停止した場合</li>
              <li>その他、運営者が停止または中断を必要と判断した場合</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">第6条（利用資格の停止・登録抹消）</h2>
            <p>運営者は、ユーザーが本規約に違反した場合、事前の通知なく、当該ユーザーに対する本サービスの利用を停止し、または登録を抹消することができます。</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">第7条（退会）</h2>
            <p>ユーザーは、運営者の定める手続により、本サービスから退会できるものとします。</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">第8条（保証の否認および免責）</h2>
            <ol className="list-decimal pl-6 space-y-1">
              <li>運営者は、本サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定目的への適合性、セキュリティ等に関する欠陥、エラーやバグ、権利侵害等を含む）がないことを明示的にも黙示的にも保証しません。</li>
              <li>運営者は、本サービスに起因してユーザーに生じたあらゆる損害について、運営者の故意または重過失による場合を除き、一切の責任を負いません。</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">第9条（サービス内容の変更等）</h2>
            <p>運営者は、ユーザーへの事前通知なく、本サービスの内容を変更、追加、削除、廃止することができるものとし、ユーザーはこれを承諾するものとします。</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">第10条（利用規約の変更）</h2>
            <p>運営者は、必要と判断した場合には、ユーザーに通知することなく本規約を変更することができるものとします。変更後の利用規約は、本サービス内で掲示された時点から効力を生じるものとします。</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">第11条（個人情報の取扱い）</h2>
            <p>本サービスにおける個人情報の取扱いについては、別途定める<Link href="/privacy" className="text-orange-600 hover:underline">プライバシーポリシー</Link>によります。</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">第12条（準拠法・裁判管轄）</h2>
            <ol className="list-decimal pl-6 space-y-1">
              <li>本規約の解釈にあたっては、日本法を準拠法とします。</li>
              <li>本サービスに関して紛争が生じた場合には、運営者の所在地を管轄する裁判所を専属的合意管轄とします。</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-3">お問い合わせ窓口</h2>
            <div className="bg-gray-50 rounded-lg p-4 mt-2">
              <p className="text-sm">運営者: Growth Driver 運営チーム</p>
              <p className="text-sm">メール: hrs.skyscraper@gmail.com</p>
            </div>
          </section>
        </div>

        <footer className="mt-10 pt-6 border-t border-gray-200 text-xs text-gray-500 text-center">
          <Link href="/privacy" className="hover:underline mr-4">プライバシーポリシー</Link>
          <Link href="/" className="hover:underline">Growth Driver</Link>
        </footer>
      </div>
    </div>
  )
}
