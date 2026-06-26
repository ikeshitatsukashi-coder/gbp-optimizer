import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { industryDefaults, stores, toneConfigs } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface GenerateReplyInput {
  /** Google review resource name (accounts/.../locations/.../reviews/...) */
  reviewName: string
  /** Optional: override store data (e.g. when previewing without a real review) */
  override?: {
    locationName?: string
    reviewer?: string | null
    starRating?: number | null
    comment?: string | null
  }
  /** Additional user instructions to inject into the prompt */
  extraInstructions?: string
}

export interface GenerateReplyResult {
  reply: string
  meta: {
    storeName: string
    industry: string
    allowEmoji: boolean
    banKundCustomer: boolean
  }
}

const INDUSTRY_LABELS_JP: Record<string, string> = {
  btob_logistics: "BtoB物流（運送・倉庫・観光バス）",
  bakery: "ベーカリー",
  funeral: "葬祭",
  restaurant: "飲食店",
  construction: "建設・不動産・建物管理",
  staffing: "人材派遣",
  buyback: "買取・質屋・リサイクル",
  general_btoc: "BtoC一般",
  general_btob: "BtoB一般",
}

/**
 * レビューの reviewer/star/comment と店舗の industry/tone 設定を元に
 * Claude API に返信文を生成させる。
 */
export async function generateReviewReply(
  input: GenerateReplyInput
): Promise<GenerateReplyResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured")
  }

  // 1. レビューに紐付く店舗を特定
  const reviewMatch = input.reviewName.match(/^(accounts\/[^/]+\/locations\/[^/]+)/)
  if (!reviewMatch) {
    throw new Error("Invalid reviewName format (expected accounts/.../locations/.../reviews/...)")
  }
  const accountLocationPath = reviewMatch[1]
  const locationName = `locations/${accountLocationPath.split("/locations/")[1]}`

  // 2. 店舗データ + 業種デフォルト + 店舗別トーン上書き を取得
  const [storeRow] = await db
    .select({
      title: stores.title,
      industry: stores.industry,
      notes: stores.notes,
      parentCompany: stores.parentCompany,
    })
    .from(stores)
    .where(eq(stores.locationName, locationName))

  if (!storeRow) {
    throw new Error(`Store not found in DB: ${locationName}. Sync stores first.`)
  }

  const [defaults] = await db
    .select()
    .from(industryDefaults)
    .where(eq(industryDefaults.industry, storeRow.industry))

  const [tone] = await db
    .select()
    .from(toneConfigs)
    .where(eq(toneConfigs.locationName, locationName))

  // 3. レビュー内容（override 優先、未指定なら DB 不要前提のため input から要求）
  const reviewer = input.override?.reviewer ?? null
  const starRating = input.override?.starRating ?? null
  const comment = input.override?.comment ?? null

  // 4. プロンプト構築
  const industryLabel = INDUSTRY_LABELS_JP[storeRow.industry] ?? storeRow.industry
  const allowEmoji = tone?.allowEmoji ?? defaults?.allowEmoji ?? false
  const banKundCustomer = tone?.banKundCustomer ?? defaults?.banKundCustomer ?? false
  const styleNotes = tone?.styleNotes ?? defaults?.styleNotes ?? ""
  const openings = tone?.openings ?? defaults?.openings ?? []
  const closings = tone?.closings ?? defaults?.closings ?? []
  const signatureKeywords = tone?.signatureKeywords ?? []
  const addresseePattern = tone?.addresseePattern ?? null

  const banLines = banKundCustomer
    ? "- 「お客様」「ご来店」「ご利用」「お客様の声」など顧客前提の語は使わない。代わりに「皆さま」「投稿者様」「ご評価」を使う。"
    : "- 投稿者を実顧客として扱ってよい。「お客様」「ご来店」「ご利用」を使ってOK。"

  const emojiLines = allowEmoji
    ? "- 絵文字 (😊🍞✨等) を1〜3個まで自然に使ってよい。"
    : "- 絵文字・顔文字・過剰な記号は禁止。"

  const addresseeLines = addresseePattern
    ? `- 投稿者への呼びかけパターン: ${addresseePattern}`
    : ""

  const sigLines =
    signatureKeywords.length > 0
      ? `- 言及候補キーワード（自然に1つ取り入れる）: ${signatureKeywords.join(", ")}`
      : ""

  const ratingDesc =
    starRating == null
      ? "（未指定）"
      : `${starRating} 星 / 5${
          starRating <= 2
            ? "（低評価・クレームの可能性あり、誠実な謝意と改善姿勢で）"
            : starRating >= 4
              ? "（高評価・好意的、感謝中心で）"
              : "（中評価、感謝と改善示唆をバランスよく）"
        }`

  const commentDesc = comment ? comment : "（コメントなし）"

  const examplesBlock = [
    openings.length > 0
      ? `冒頭フレーズ案: ${openings.slice(0, 4).join(" / ")}`
      : null,
    closings.length > 0 ? `結びフレーズ案: ${closings.slice(0, 4).join(" / ")}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const prompt = `あなたは「${storeRow.title}」の店舗オーナーとして、Google ビジネスプロフィールに投稿されたクチコミに公式返信を作成します。
業種: ${industryLabel}

# 業種ガイドライン
${styleNotes}
${banLines}
${emojiLines}
${addresseeLines}
${sigLines}

# 文体ルール（全業種共通）
- 敬体・丁寧語で統一。
- 3〜5文・150〜350文字程度。
- 「テンプレ感」を出さず、クチコミの中身に具体的に触れる。
- 誤解を生む断定や、他社名への言及は避ける。
- 改行は意味の区切りで自然に入れてよい（過剰な改行はしない）。

${examplesBlock ? `# 言い回しのバリエーション参考\n${examplesBlock}` : ""}

# 対象のクチコミ
- 投稿者: ${reviewer ?? "（匿名）"}
- 評価: ${ratingDesc}
- コメント: ${commentDesc}

${input.extraInstructions ? `# 追加指示\n${input.extraInstructions}\n` : ""}

# 出力
返信本文のみを日本語で出力してください。挨拶や前置き、Markdown 記法、解説、見出しは不要です。返信本文のみ。`

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  })

  const reply =
    message.content[0]?.type === "text" ? message.content[0].text.trim() : ""

  if (!reply) {
    throw new Error("Empty reply from Claude API")
  }

  return {
    reply,
    meta: {
      storeName: storeRow.title,
      industry: storeRow.industry,
      allowEmoji,
      banKundCustomer,
    },
  }
}
