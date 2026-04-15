export interface ReplyTemplate {
  id: string
  label: string
  ratingRange: [number, number] // min, max
  template: string
}

export const replyTemplates: ReplyTemplate[] = [
  // 高評価（5星）
  {
    id: "high-5-general",
    label: "5星 - 一般的な感謝",
    ratingRange: [5, 5],
    template:
      "{author}様\n\nこの度は大変嬉しいお言葉をいただき、誠にありがとうございます。お客様にご満足いただけたことを、スタッフ一同大変嬉しく思っております。\n今後もお客様のご期待にお応えできるよう、サービスの向上に努めてまいります。\nまたのご利用を心よりお待ちしております。\n\n{storeName}",
  },
  {
    id: "high-5-service",
    label: "5星 - サービス称賛への返信",
    ratingRange: [5, 5],
    template:
      "{author}様\n\nこの度は温かいクチコミをいただき、誠にありがとうございます。サービスについてお褒めの言葉を頂戴し、大変光栄でございます。\nお客様からのお言葉を励みに、今後もより一層のサービス向上に取り組んでまいります。\nお気軽にご相談いただけましたら幸いです。またのお越しをお待ちしております。\n\n{storeName}",
  },
  // 高評価（4星）
  {
    id: "high-4-general",
    label: "4星 - 感謝 + 改善意欲",
    ratingRange: [4, 4],
    template:
      "{author}様\n\nこの度は貴重なクチコミをいただき、誠にありがとうございます。高い評価をいただけましたこと、大変嬉しく存じます。\nさらにご満足いただけるよう、サービスの改善に努めてまいります。お気づきの点がございましたら、いつでもお気軽にお知らせくださいませ。\nまたのご利用を心よりお待ちしております。\n\n{storeName}",
  },
  // 普通（3星）
  {
    id: "mid-3-general",
    label: "3星 - 感謝 + 改善約束",
    ratingRange: [3, 3],
    template:
      "{author}様\n\nこの度はご意見をお寄せいただき、誠にありがとうございます。ご期待に十分にお応えできなかった点がございましたら、心よりお詫び申し上げます。\nいただいたご意見を真摯に受け止め、サービスの改善に取り組んでまいります。\n今後ともご指導ご鞭撻のほど、よろしくお願いいたします。\n\n{storeName}",
  },
  // 低評価（2星）
  {
    id: "low-2-general",
    label: "2星 - お詫び + 改善",
    ratingRange: [2, 2],
    template:
      "{author}様\n\nこの度は貴重なご意見をいただき、ありがとうございます。ご満足いただける対応ができず、大変申し訳ございませんでした。\nいただいたご指摘を社内で共有し、再発防止とサービスの改善に全力で取り組んでまいります。\nもしよろしければ、詳しいご状況をお聞かせいただけますと幸いです。改めてご満足いただけるよう努めさせていただきます。\n\n{storeName}",
  },
  // 低評価（1星）
  {
    id: "low-1-general",
    label: "1星 - 深いお詫び + 改善約束",
    ratingRange: [1, 1],
    template:
      "{author}様\n\nこの度はご不快な思いをおかけしてしまい、深くお詫び申し上げます。お客様のご期待に沿えなかったことを、大変重く受け止めております。\nいただいたご指摘を真摯に受け止め、スタッフ一同、早急に改善に取り組んでまいります。\nもしよろしければ、詳細をお伺いできればと存じます。直接ご連絡いただけましたら、責任をもって対応させていただきます。\n\n{storeName}",
  },
  // 汎用
  {
    id: "general-thanks",
    label: "汎用 - シンプルな感謝",
    ratingRange: [1, 5],
    template:
      "{author}様\n\nこの度はクチコミをいただき、誠にありがとうございます。お客様からのお声は、私どもにとって大変貴重なものでございます。\n今後ともお客様にご満足いただけるよう精進してまいります。引き続きどうぞよろしくお願いいたします。\n\n{storeName}",
  },
]

/**
 * Get matching templates for a given rating
 */
export function getTemplatesForRating(rating: number): ReplyTemplate[] {
  return replyTemplates.filter(
    (t) => rating >= t.ratingRange[0] && rating <= t.ratingRange[1]
  )
}

/**
 * Apply variables to a template
 */
export function applyTemplate(
  template: string,
  vars: { author: string; storeName: string }
): string {
  return template
    .replace(/{author}/g, vars.author)
    .replace(/{storeName}/g, vars.storeName)
}
