import { NextResponse } from "next/server"
import { getAccessToken } from "@/lib/get-session"
import { db } from "@/lib/db"
import { reviewsArchive } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { generateReviewReply } from "@/lib/services/generate-review-reply"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

/**
 * POST /api/reviews/generate-reply
 * Body: { reviewName: string, extraInstructions?: string }
 *
 * 業種別トーンでレビュー返信文を Claude API で生成する。
 * レビュー本文は DB の reviews_archive から自動取得。
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(`gen-reply:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 60,
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

  let body: { reviewName?: string; extraInstructions?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!body.reviewName) {
    return NextResponse.json({ error: "reviewName is required" }, { status: 400 })
  }

  // DB のスナップショットからレビュー本文を引き当てる
  const [row] = await db
    .select({
      reviewer: reviewsArchive.reviewer,
      starRating: reviewsArchive.starRating,
      comment: reviewsArchive.comment,
    })
    .from(reviewsArchive)
    .where(eq(reviewsArchive.reviewName, body.reviewName))

  if (!row) {
    return NextResponse.json(
      {
        error:
          "Review not found in archive. Run 'クチコミ取得' on /google-data/gbp/review-flag to refresh.",
      },
      { status: 404 }
    )
  }

  try {
    const result = await generateReviewReply({
      reviewName: body.reviewName,
      override: {
        reviewer: row.reviewer,
        starRating: row.starRating,
        comment: row.comment,
      },
      extraInstructions: body.extraInstructions,
    })
    return NextResponse.json(result)
  } catch (e) {
    return errorResponse("Failed to generate reply", e)
  }
}
