import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "データ削除のご請求 | GBP Optimizer",
  description:
    "GBP Optimizer（株式会社LIGO 社内ツール）で保持する連携データの削除方法および削除されるデータの範囲",
}

/**
 * データ削除の手順（公開ページ・認証不要）
 *
 * Meta（Instagram / Facebook）の App Review では、
 * 「データ削除に関する指示」のURL提出が必須のため用意している。
 * プライバシーポリシー（/privacy）と対で参照される。
 */
export default function DataDeletionPage() {
  const sections: { heading: string; body: React.ReactNode }[] = [
    {
      heading: "1. このページについて",
      body: (
        <p>
          本ツール「GBP Optimizer」（以下「本ツール」）は、株式会社LIGO（以下「当社」）が
          自社および当社がMEO運用を受託するお客様の店舗情報を管理する目的で運用する
          社内向けツールです。本ページでは、本ツールが保持するデータの削除をご請求いただく
          方法と、削除の対象となるデータの範囲を説明します。
        </p>
      ),
    },
    {
      heading: "2. 削除の対象となるデータ",
      body: (
        <>
          <p>
            ご請求により、当社が本ツール内に保持する以下のデータを削除します。
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              Instagram・Facebookページとの連携情報（アカウント名、アカウントID、
              当社が預かったアクセストークン）
            </li>
            <li>連携により取得した投稿内容・画像・投稿日時などのコンテンツ情報</li>
            <li>本ツールに登録された店舗情報、予約投稿、アップロードされた画像</li>
            <li>クチコミの取得・返信に関する記録</li>
          </ul>
          <p className="mt-2">
            アクセストークンは暗号化して保管しており、削除のご請求を受けた時点で
            復号できない形で消去します。
          </p>
        </>
      ),
    },
    {
      heading: "3. 削除をご請求いただく方法",
      body: (
        <>
          <p>
            下記の窓口まで、メールにてご連絡ください。専用のフォームやアカウント登録は不要です。
          </p>
          <div className="mt-3 rounded-lg border bg-gray-50 p-4">
            <p className="font-bold text-gray-900">メールでのご請求</p>
            <p className="mt-1">
              宛先:{" "}
              <a href="mailto:meo-support@li-go.jp" className="text-[#4a90e2] underline">
                meo-support@li-go.jp
              </a>
            </p>
            <p className="mt-2 text-gray-600">件名の例: データ削除の請求</p>
            <p className="mt-2 text-gray-600">本文に以下をご記載ください。</p>
            <ul className="list-disc pl-5 mt-1 space-y-1 text-gray-600">
              <li>貴社名（店舗名）</li>
              <li>削除をご希望のInstagramアカウント名またはFacebookページ名</li>
              <li>ご連絡先（お電話番号またはメールアドレス）</li>
            </ul>
          </div>
          <p className="mt-3">
            ご本人またはご担当者様であることを確認したうえで、
            <b>ご連絡から7営業日以内</b>に削除を実施し、完了をメールでご報告します。
          </p>
        </>
      ),
    },
    {
      heading: "4. 連携の解除のみをご希望の場合",
      body: (
        <>
          <p>
            データの削除ではなく、連携の停止のみをご希望の場合は、
            お客様ご自身の操作でいつでも解除できます。
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              Instagram・Facebook: Facebookの「設定とプライバシー」→「設定」→
              「ビジネスインテグレーション」から、本ツールへの連携を削除
            </li>
            <li>
              上記の解除を行うと、以後当社は新たなデータを取得できなくなります。
              既に取得済みのデータの削除をご希望の場合は、前項の窓口までご連絡ください。
            </li>
          </ul>
        </>
      ),
    },
    {
      heading: "5. 削除後の取り扱い",
      body: (
        <>
          <p>
            削除後、当社は当該データを復元しません。ただし、次のものは削除の対象外となる
            場合があります。
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              法令により保存が義務付けられている記録（契約・請求に関する書類など）
            </li>
            <li>
              既にGoogleビジネスプロフィール等の外部サービス上へ公開された投稿。
              これらは各サービス側の管理画面から削除していただく必要があります
            </li>
          </ul>
        </>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-5">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm p-8 md:p-10">
        <h1 className="text-2xl font-bold">データ削除のご請求</h1>
        <p className="text-sm text-gray-500 mt-2">
          GBP Optimizer（株式会社LIGO 社内ツール）
        </p>
        <p className="text-xs text-gray-400 mt-1">制定日: 2026年8月17日</p>

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
        <p className="text-xs text-gray-500 mt-1">
          あわせて{" "}
          <a href="/privacy" className="text-[#4a90e2] underline">
            プライバシーポリシー
          </a>{" "}
          もご確認ください。
        </p>
      </div>
    </div>
  )
}
