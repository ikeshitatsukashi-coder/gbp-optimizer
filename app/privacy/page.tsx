import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "プライバシーポリシー | GBP Optimizer",
  description:
    "GBP Optimizer（株式会社LIGO 社内ツール）における個人情報および外部サービス連携データの取り扱いについて",
}

/**
 * プライバシーポリシー（公開ページ・認証不要）
 *
 * Meta（Instagram / Facebook）の App Review では、
 * 公開されたプライバシーポリシーURLの提出が必須のため用意している。
 * LINE / Google の各種連携でも同様に参照される。
 */
export default function PrivacyPolicyPage() {
  const sections: { heading: string; body: React.ReactNode }[] = [
    {
      heading: "1. 事業者情報",
      body: (
        <>
          <p>
            本ツール「GBP Optimizer」（以下「本ツール」）は、株式会社LIGO（以下「当社」）が
            自社および当社がMEO運用を受託するお客様の店舗情報を管理する目的で運用する
            社内向けツールです。
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>名称: 株式会社LIGO</li>
            <li>
              ウェブサイト:{" "}
              <a
                href="https://www.li-go.jp"
                target="_blank"
                rel="noreferrer"
                className="text-[#4a90e2] underline"
              >
                https://www.li-go.jp
              </a>
            </li>
            <li>お問い合わせ: meo-support@li-go.jp</li>
          </ul>
        </>
      ),
    },
    {
      heading: "2. 本ツールの利用者",
      body: (
        <p>
          本ツールは一般公開されたサービスではなく、当社が許可した従業員および業務委託先のみが
          利用できます。ログインは当社が管理するGoogleアカウント（li-go.jp ドメイン）に限定しています。
        </p>
      ),
    },
    {
      heading: "3. 取得する情報",
      body: (
        <>
          <p>本ツールは、業務遂行のために以下の情報を取得・保存します。</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <b>利用者情報</b>: 氏名、メールアドレス（Googleアカウントから取得）
            </li>
            <li>
              <b>店舗情報</b>: 店舗名、住所、電話番号、カテゴリ、営業時間等（Google
              ビジネスプロフィールから取得）
            </li>
            <li>
              <b>クチコミ情報</b>: 投稿者の表示名、プロフィール画像URL、評価、本文、投稿日時、
              オーナー返信（Google ビジネスプロフィールから取得）
            </li>
            <li>
              <b>投稿・画像</b>: 当社が作成した投稿本文、および当社がアップロードした画像
            </li>
            <li>
              <b>アンケート回答</b>: 選択された回答、および回答者が任意で入力した氏名・連絡先
            </li>
            <li>
              <b>外部SNS情報</b>: 連携を設定した場合に限り、Instagram・Facebook等の
              アカウント情報および投稿内容（本文・画像・投稿日時）
            </li>
          </ul>
        </>
      ),
    },
    {
      heading: "4. 利用目的",
      body: (
        <ul className="list-disc pl-5 space-y-1">
          <li>Google ビジネスプロフィールの情報管理・投稿作成・クチコミ返信の効率化</li>
          <li>店舗の集客状況（表示回数・アクション数）の分析とレポート作成</li>
          <li>お客様アンケートの実施および集計</li>
          <li>
            外部SNS（Instagram・Facebook等）に投稿された内容を、当社の運用判断のもとで
            Google ビジネスプロフィールへ転載すること
          </li>
        </ul>
      ),
    },
    {
      heading: "5. 外部サービスとの連携",
      body: (
        <>
          <p>
            本ツールは、利用者が明示的に連携を設定した場合に限り、以下の外部サービスの
            API を通じて情報を取得します。連携はいつでも本ツールの画面から解除でき、
            解除後は当該サービスからの情報取得を停止します。
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Google（ビジネスプロフィール、スプレッドシート、Analytics）</li>
            <li>Meta（Instagram、Facebook）</li>
            <li>LINE</li>
          </ul>
          <p className="mt-2">
            取得した情報は上記「4. 利用目的」の範囲内でのみ使用し、
            広告配信目的での利用、および第三者への販売・貸与は一切行いません。
          </p>
        </>
      ),
    },
    {
      heading: "6. 情報の保管と安全管理",
      body: (
        <ul className="list-disc pl-5 space-y-1">
          <li>データは暗号化された通信（HTTPS）を通じて送受信されます。</li>
          <li>
            アクセストークン等の認証情報は暗号化された環境変数またはデータベースに保管し、
            画面上に表示しません。
          </li>
          <li>本ツールへのアクセスは当社が許可したアカウントに限定しています。</li>
          <li>
            アップロードされた画像は、Google
            ビジネスプロフィールが取得できるようにするため、推測困難なURLで保管されます。
          </li>
        </ul>
      ),
    },
    {
      heading: "7. 保存期間と削除",
      body: (
        <p>
          取得した情報は業務上必要な期間保存します。連携解除、契約終了、または対象者からの
          請求があった場合は、法令で保存が義務付けられている情報を除き、速やかに削除します。
          削除のご依頼は下記お問い合わせ先までご連絡ください。
        </p>
      ),
    },
    {
      heading: "8. 開示・訂正・削除の請求",
      body: (
        <p>
          ご自身の情報について、開示・訂正・利用停止・削除をご希望の場合は、
          meo-support@li-go.jp までご連絡ください。ご本人であることを確認のうえ、
          法令に従って対応いたします。
        </p>
      ),
    },
    {
      heading: "9. 本ポリシーの変更",
      body: (
        <p>
          本ポリシーの内容は、法令の変更や本ツールの機能追加に応じて改定する場合があります。
          重要な変更を行う場合は、本ページにて周知します。
        </p>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-5">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm p-8 md:p-10">
        <h1 className="text-2xl font-bold">プライバシーポリシー</h1>
        <p className="text-sm text-gray-500 mt-2">
          GBP Optimizer（株式会社LIGO 社内ツール）
        </p>
        <p className="text-xs text-gray-400 mt-1">制定日: 2026年7月29日</p>

        <div className="mt-8 space-y-7">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-base font-bold text-gray-900 mb-2">{s.heading}</h2>
              <div className="text-sm text-gray-700 leading-relaxed">{s.body}</div>
            </section>
          ))}
        </div>

        <hr className="my-8" />
        <p className="text-xs text-gray-500">
          お問い合わせ: 株式会社LIGO　meo-support@li-go.jp
        </p>
      </div>
    </div>
  )
}
