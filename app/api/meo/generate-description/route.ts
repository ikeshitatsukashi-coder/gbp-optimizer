import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { industryDefaults, stores } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const INDUSTRY_LABELS_JP: Record<string, string> = {
  btob_logistics: "運送・物流・倉庫",
  bakery: "ベーカリー",
  funeral: "葬祭",
  restaurant: "飲食店",
  construction: "建設・不動産・建物管理",
  staffing: "人材派遣",
  buyback: "買取・質屋・リサイクル",
  general_btoc: "一般消費者向けサービス",
  general_btob: "法人向けサービス",
}

/**
 * POST /api/meo/generate-description
 * Body: { locationName: string, keywords?: string }
 *
 * GBP の「ビジネス説明文」の下書きを Claude で生成して返す。
 * 生成するだけで GBP への書き込みは行わない — ユーザーが店舗基本情報ページで
 * 内容を確認・編集してから保存する。
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(`gen-desc:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 20,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } }
    )
  }

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY が未設定です。Vercel の環境変数に設定すると AI 生成が使えます。",
      },
      { status: 500 }
    )
  }

  let body: { locationName?: string; keywords?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!body.locationName) {
    return NextResponse.json({ error: "locationName is required" }, { status: 400 })
  }
  const locationName = body.locationName.startsWith("locations/")
    ? body.locationName
    : `locations/${body.locationName}`

  const [store] = await db
    .select({
      title: stores.title,
      industry: stores.industry,
      primaryCategory: stores.primaryCategory,
      address: stores.address,
      parentCompany: stores.parentCompany,
    })
    .from(stores)
    .where(eq(stores.locationName, locationName))

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 })
  }

  const [tone] = await db
    .select({ styleNotes: industryDefaults.styleNotes })
    .from(industryDefaults)
    .where(eq(industryDefaults.industry, store.industry))

  const addr = store.address as {
    administrativeArea?: string
    locality?: string
  } | null
  const area = [addr?.administrativeArea, addr?.locality].filter(Boolean).join("")

  const prompt = `Google ビジネスプロフィールの「ビジネスの説明」欄に掲載する紹介文を書いてください。

# 店舗情報
- 店舗名: ${store.title}
- 業種: ${INDUSTRY_LABELS_JP[store.industry] ?? store.industry}
- Google カテゴリ: ${store.primaryCategory ?? "未設定"}
- 所在地: ${area || "不明"}
${store.parentCompany ? `- 運営会社: ${store.parentCompany}` : ""}
${body.keywords ? `- 強調したいキーワード: ${body.keywords}` : ""}

# 業種の文体ガイドライン
${tone?.styleNotes ?? "丁寧で信頼感のある文体。"}

# 執筆ルール
- 300〜600文字。
- 検索されやすい地域名・業種キーワードを自然に含める。
- 誇大表現・比較優位の断定（「地域No.1」等）・電話番号や URL の記載は禁止（GBP ポリシー違反）。
- 絵文字・記号の乱用は禁止。
- 一人称は「当社」または「当店」（業種に合わせて）。
- 事実として確認できない具体的な数値（創業年・従業員数等）は書かない。

説明文の本文のみを出力してください。見出し・解説は不要です。`

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    })
    const description =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : ""
    if (!description) throw new Error("Empty response")
    return NextResponse.json({ description })
  } catch (e) {
    return errorResponse("Failed to generate description", e)
  }
}
