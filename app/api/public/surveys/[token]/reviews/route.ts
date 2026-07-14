import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { surveys, stores, surveyReviews } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { locationNameOf } from "@/lib/public-link"

/**
 * POST /api/public/surveys/{token}/reviews
 * ツール内ユーザーレビューの受付（Googleには公開されない・社内のみ閲覧）。
 * 不満系の回答者の受け皿。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = checkRateLimit(`pub-survey-review:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 20,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const { token } = await params
  const [survey] = await db.select().from(surveys).where(eq(surveys.token, token))
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let body: {
    store?: string
    responseId?: number
    rating?: number
    comment?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.store) {
    return NextResponse.json({ error: "店舗が不明です" }, { status: 400 })
  }
  const locationName = locationNameOf(body.store)
  const [store] = await db
    .select({ locationName: stores.locationName })
    .from(stores)
    .where(eq(stores.locationName, locationName))
  if (!store) {
    return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 })
  }

  const rating =
    typeof body.rating === "number" && body.rating >= 1 && body.rating <= 5
      ? Math.round(body.rating)
      : null
  const comment = body.comment?.trim()?.slice(0, 2000) || null
  if (!rating && !comment) {
    return NextResponse.json({ error: "評価またはコメントを入力してください" }, { status: 400 })
  }

  try {
    await db.insert(surveyReviews).values({
      surveyId: survey.id,
      responseId: body.responseId ?? null,
      locationName,
      rating,
      comment,
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Failed to save user review:", e)
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 })
  }
}
