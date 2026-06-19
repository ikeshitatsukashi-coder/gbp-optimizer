// DATABASE_URL is loaded via `tsx --env-file=.env.local` (see package.json)
import { db } from "../lib/db"
import { industryDefaults } from "../lib/db/schema"

/**
 * 業種別のデフォルト返信トーンを初期投入する。
 * 既に存在する場合は ON CONFLICT で上書き。
 *
 * 文面ポリシー（ユーザー指定要件より）：
 *  - BtoB（運送・物流・観光バス・倉庫）: 「お客様/ご来店」NG、絵文字NG、敬体
 *  - ベーカリー: カジュアル温かみ、絵文字OK、投稿者名+様
 *  - 葬祭: 厳粛・寄り添い、お悔やみ必須
 *  - 飲食: カジュアル丁寧、英語レビューには英語返信
 *  - 建設・不動産・建物管理: 丁寧文体、実顧客なら「お客様」OK
 *  - 人材派遣: 派遣スタッフ目線で改善約束
 *  - 買取・質屋・リサイクル: 信頼感重視、BtoCなので「お客様」OK
 */
const defaults = [
  {
    industry: "btob_logistics" as const,
    allowEmoji: false,
    banKundCustomer: true,
    styleNotes: [
      "ビジネスライク・敬体・丁寧語のみ。",
      "投稿者は実顧客でない可能性が高いため『お客様』『ご来店』『ご利用』『お客様の声』は使用禁止。",
      "代替表現: 『皆さま』『地域の皆さま』『周囲の皆さま』『弊社車両（の運転）に関しまして』『ご指摘いただいた件』『投稿者様』『ご評価』。",
      "絵文字・顔文字・過剰な記号は禁止。",
      "個人情報や他社名（佐川急便等）への無用な言及を避ける。",
      "車両ナンバーの指摘がある場合は『特定・指導』を明記する。",
    ].join("\n"),
    openings: [
      "この度は",
      "お忙しい中",
      "弊社車両に関しまして",
      "貴重なご評価をいただき",
      "ご指摘を頂戴し",
    ],
    closings: [
      "今後とも安全運行と確実な業務遂行に努めてまいります。",
      "引き続き精進してまいります。",
      "貴重なご指摘を頂戴し誠にありがとうございました。",
      "今後ともご支援のほどよろしくお願い申し上げます。",
    ],
    templatesLowNoComment: [
      "この度はご評価をいただきありがとうございます。お気づきの点がございましたら、改善の参考とさせていただきたくぜひ具体的にお聞かせください。頂戴したご意見をもとに、安全運行とサービス品質の向上に努めてまいります。",
      "ご評価をいただき誠にありがとうございます。具体的なご指摘がございましたら参考とさせていただきたく存じます。引き続き安全運行に努めてまいります。",
    ],
    templatesHighNoComment: [
      "この度は弊社にご評価をいただき、誠にありがとうございます。頂戴したご評価を励みに、今後とも安全運行と確実な業務遂行に努めてまいります。",
      "ご評価いただき誠にありがとうございます。引き続き地域の皆さまの信頼にお応えできるよう精進してまいります。",
    ],
  },
  {
    industry: "bakery" as const,
    allowEmoji: true,
    banKundCustomer: false,
    styleNotes: [
      "カジュアルで温かみのある文体。",
      "投稿者名+様 で呼びかける。",
      "絵文字（😊🍞✨🥹🍕等）使用OK。",
      "具体的に褒められた商品（カレーパン等）に必ず触れる。",
      "改行を使って読みやすく。",
    ].join("\n"),
    openings: [
      "この度はご来店いただき",
      "嬉しいご感想をいただき",
      "ご来店いただき誠にありがとうございます",
    ],
    closings: [
      "またのご来店を心よりお待ちしております🍞✨",
      "スタッフ一同の励みになります😊",
      "またお会いできる日を楽しみにしております🥹",
    ],
    templatesLowNoComment: [
      "この度はご来店いただき誠にありがとうございます。お気づきの点がございましたら、ぜひ具体的にお聞かせください。皆さまに喜んでいただけるパン作りに努めてまいります。",
    ],
    templatesHighNoComment: [
      "この度はご来店いただき誠にありがとうございます😊 スタッフ一同、心より感謝申し上げます。またのご来店を心よりお待ちしております🍞✨",
    ],
  },
  {
    industry: "funeral" as const,
    allowEmoji: false,
    banKundCustomer: false,
    styleNotes: [
      "厳粛・寄り添いの文体。",
      "冒頭に必ずお悔やみの言葉を入れる。",
      "結びに故人様のご冥福をお祈りする一文を入れる。",
      "絵文字・装飾記号は厳禁。",
    ].join("\n"),
    openings: [
      "この度は弊会館をお選びいただき",
      "この度はご利用いただき",
      "ご利用いただき誠にありがとうございました",
    ],
    closings: [
      "故人様のご冥福を心よりお祈り申し上げます。",
      "改めまして、心よりお悔やみ申し上げます。",
    ],
    templatesLowNoComment: [
      "この度はご利用いただき誠にありがとうございました。心よりお悔やみ申し上げます。お気づきの点がございましたら、改善の参考とさせていただきたくぜひお聞かせください。故人様のご冥福を心よりお祈り申し上げます。",
    ],
    templatesHighNoComment: [
      "この度は弊会館をお選びいただき、誠にありがとうございました。心よりお悔やみ申し上げます。頂戴したご評価を励みに、引き続き丁寧なご対応に努めてまいります。故人様のご冥福を心よりお祈り申し上げます。",
    ],
  },
  {
    industry: "restaurant" as const,
    allowEmoji: true,
    banKundCustomer: false,
    styleNotes: [
      "カジュアル丁寧。",
      "海外英語レビューには英語で返信する。",
      "具体的に褒められたメニュー・サービスに触れる。",
    ].join("\n"),
    openings: ["この度はご来店いただき", "嬉しいご感想を頂戴し"],
    closings: [
      "またのご来店を心よりお待ちしております。",
      "スタッフ一同、心より感謝申し上げます。",
    ],
    templatesLowNoComment: [
      "この度はご来店いただきありがとうございます。お気づきの点がございましたら、ぜひ具体的にお聞かせください。サービス改善の参考にさせていただきます。",
    ],
    templatesHighNoComment: [
      "この度はご来店いただき誠にありがとうございます。スタッフ一同の励みになります。またのご来店を心よりお待ちしております。",
    ],
  },
  {
    industry: "construction" as const,
    allowEmoji: false,
    banKundCustomer: false,
    styleNotes: [
      "丁寧文体。",
      "入居・施工等の実顧客なら『お客様』『ご利用』使用OK。",
      "入居者の苦情には『具体的な聞き取り提案』＋『再発防止』のテンプレを使う。",
    ].join("\n"),
    openings: ["この度はご利用いただき", "貴重なご意見を頂戴し"],
    closings: [
      "今後ともよろしくお願い申し上げます。",
      "引き続きサービス品質の向上に努めてまいります。",
    ],
    templatesLowNoComment: [
      "貴重なご意見をいただきありがとうございます。詳細をお聞かせいただければ幸いです。改善に向けて真摯に取り組んでまいります。",
    ],
    templatesHighNoComment: [
      "ご評価をいただき誠にありがとうございます。引き続き品質向上に努めてまいります。今後ともよろしくお願い申し上げます。",
    ],
  },
  {
    industry: "staffing" as const,
    allowEmoji: false,
    banKundCustomer: false,
    styleNotes: [
      "丁寧文体。",
      "派遣スタッフ本人なら『ご利用』OK。",
      "連絡頻度や案件への厳しい指摘には労働者目線の改善約束を返す。",
    ].join("\n"),
    openings: ["弊社をご利用いただき", "貴重なご意見を頂戴し"],
    closings: [
      "今後ともよりよいサポートに努めてまいります。",
      "引き続きどうぞよろしくお願い申し上げます。",
    ],
    templatesLowNoComment: [
      "貴重なご意見をいただきありがとうございます。具体的なご指摘がございましたらお聞かせください。スタッフ・登録者の皆さまにとってよりよい環境作りに努めてまいります。",
    ],
    templatesHighNoComment: [
      "弊社をご利用いただき誠にありがとうございます。今後ともよりよいサポートに努めてまいります。",
    ],
  },
  {
    industry: "buyback" as const,
    allowEmoji: false,
    banKundCustomer: false,
    styleNotes: [
      "信頼感重視・丁寧文体。",
      "BtoCなので『お客様』『ご利用』使用OK。",
    ].join("\n"),
    openings: ["この度はご利用いただき", "貴重なご評価を頂戴し"],
    closings: [
      "またのご利用を心よりお待ちしております。",
      "引き続き誠実なお取引に努めてまいります。",
    ],
    templatesLowNoComment: [
      "貴重なご意見をいただきありがとうございます。お気づきの点がございましたら具体的にお聞かせください。サービス改善の参考にさせていただきます。",
    ],
    templatesHighNoComment: [
      "この度はご利用いただき誠にありがとうございます。引き続き誠実なお取引に努めてまいります。またのご利用を心よりお待ちしております。",
    ],
  },
  {
    industry: "general_btoc" as const,
    allowEmoji: false,
    banKundCustomer: false,
    styleNotes: ["丁寧文体・BtoC前提。", "『お客様』『ご来店』『ご利用』使用OK。"].join("\n"),
    openings: ["この度はご利用いただき", "ご評価を頂戴し"],
    closings: ["またのご利用を心よりお待ちしております。", "今後ともよろしくお願いいたします。"],
    templatesLowNoComment: [
      "貴重なご意見をいただきありがとうございます。具体的なご指摘がございましたらお聞かせください。改善の参考にさせていただきます。",
    ],
    templatesHighNoComment: [
      "ご評価をいただき誠にありがとうございます。引き続き品質向上に努めてまいります。",
    ],
  },
  {
    industry: "general_btob" as const,
    allowEmoji: false,
    banKundCustomer: true,
    styleNotes: [
      "ビジネスライク・敬体。",
      "投稿者を実顧客と決めつけない（『お客様』『ご来店』NG）。",
      "代替: 『皆さま』『投稿者様』『ご評価』。",
    ].join("\n"),
    openings: ["この度はご評価を頂戴し", "貴重なご意見をいただき"],
    closings: ["引き続き業務品質の向上に努めてまいります。", "今後ともよろしくお願い申し上げます。"],
    templatesLowNoComment: [
      "ご評価をいただきありがとうございます。具体的なご指摘がございましたらお聞かせください。業務品質の向上に努めてまいります。",
    ],
    templatesHighNoComment: [
      "ご評価をいただき誠にありがとうございます。引き続き業務品質の向上に努めてまいります。",
    ],
  },
]

async function main() {
  console.log(`Seeding industry defaults (${defaults.length} rows)...`)
  for (const row of defaults) {
    await db
      .insert(industryDefaults)
      .values(row)
      .onConflictDoUpdate({
        target: industryDefaults.industry,
        set: {
          allowEmoji: row.allowEmoji,
          banKundCustomer: row.banKundCustomer,
          styleNotes: row.styleNotes,
          openings: row.openings,
          closings: row.closings,
          templatesLowNoComment: row.templatesLowNoComment,
          templatesHighNoComment: row.templatesHighNoComment,
        },
      })
    console.log(`  ✓ ${row.industry}`)
  }
  console.log("Done.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
