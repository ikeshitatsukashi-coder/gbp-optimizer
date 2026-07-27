/**
 * クチコミの感情分析（ルールベース・無料）
 *
 * 星評価を主軸に、本文のポジ/ネガ語で補正する。
 * AI（Anthropic API）を使わないため費用ゼロで動く。
 * ANTHROPIC_API_KEY を導入した際は、より精緻な判定に差し替え可能。
 */

export type Sentiment = "positive" | "neutral" | "negative"

const POSITIVE_WORDS = [
  "ありがとう", "感謝", "満足", "最高", "素晴らし", "丁寧", "親切", "きれい", "綺麗",
  "美味し", "おいし", "早い", "速い", "安心", "信頼", "おすすめ", "オススメ", "良かった",
  "よかった", "助かり", "快適", "優しい", "好印象",
]

const NEGATIVE_WORDS = [
  "最悪", "ひどい", "酷い", "残念", "不満", "遅い", "汚い", "きたない",
  "態度", "無愛想", "雑", "高い", "不親切", "対応が悪", "二度と", "がっかり",
  "失望", "クレーム", "謝罪", "問題", "delay",
]

export interface SentimentResult {
  sentiment: Sentiment
  label: string
  /** 判定の手掛かり（UIのツールチップ用） */
  hint: string
}

export function analyzeSentiment(rating: number, text: string): SentimentResult {
  const body = (text ?? "").toLowerCase()
  const pos = POSITIVE_WORDS.filter((w) => body.includes(w)).length
  const neg = NEGATIVE_WORDS.filter((w) => body.includes(w)).length

  // 星評価が主軸（1-2=ネガ / 3=中立 / 4-5=ポジ）、本文の語調で1段階まで補正
  let score = rating >= 4 ? 1 : rating === 3 ? 0 : -1
  if (score >= 0 && neg > pos && neg >= 2) score = -1
  if (score <= 0 && pos > neg && pos >= 2 && rating >= 3) score = 1

  if (score > 0) {
    return {
      sentiment: "positive",
      label: "ポジティブ",
      hint: `★${rating}${pos > 0 ? ` / 好意的な表現 ${pos} 件` : ""}`,
    }
  }
  if (score < 0) {
    return {
      sentiment: "negative",
      label: "ネガティブ",
      hint: `★${rating}${neg > 0 ? ` / 否定的な表現 ${neg} 件` : ""}`,
    }
  }
  return { sentiment: "neutral", label: "中立", hint: `★${rating}` }
}
