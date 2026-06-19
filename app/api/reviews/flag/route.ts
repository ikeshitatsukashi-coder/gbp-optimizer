import { NextResponse } from "next/server"
import { getAccessToken } from "@/lib/get-session"
import { flagReview, flagReviewsBatch } from "@/lib/services/flag-review"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

/**
 * POST /api/reviews/flag
 *
 * Body:
 *   { reviewName: "accounts/.../locations/.../reviews/..." }                  (single)
 *   { reviewNames: ["...", "...", ...], concurrency?: 3, delayMs?: 500 }      (batch)
 *
 * v4 :flag を呼び、flag_history に結果を記録する。
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(`reviews-flag:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 30,
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

  let body: {
    reviewName?: string
    reviewNames?: string[]
    concurrency?: number
    delayMs?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    if (Array.isArray(body.reviewNames)) {
      if (body.reviewNames.length === 0) {
        return NextResponse.json({ results: [], submitted: 0, failed: 0, alreadyReported: 0 })
      }
      if (body.reviewNames.length > 500) {
        return NextResponse.json(
          { error: "Too many reviewNames (max 500 per batch)" },
          { status: 400 }
        )
      }
      const results = await flagReviewsBatch(accessToken, body.reviewNames, {
        concurrency: body.concurrency,
        delayMs: body.delayMs,
      })
      const submitted = results.filter((r) => r.status === "submitted").length
      const failed = results.filter((r) => r.status === "failed").length
      const alreadyReported = results.filter((r) => r.status === "already_reported").length
      return NextResponse.json({ results, submitted, failed, alreadyReported })
    }

    if (body.reviewName) {
      const result = await flagReview(accessToken, { reviewName: body.reviewName })
      return NextResponse.json({ result })
    }

    return NextResponse.json(
      { error: "reviewName or reviewNames is required" },
      { status: 400 }
    )
  } catch (e) {
    return errorResponse("Failed to flag review", e)
  }
}
