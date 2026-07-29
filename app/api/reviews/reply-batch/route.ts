import { NextResponse } from "next/server"
import { getAccessToken } from "@/lib/get-session"
import { createGmbClient } from "@/lib/gbp-client"
import { db } from "@/lib/db"
import { reviewsArchive } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { requireRole } from "@/lib/services/authz"

export interface ReplyItem {
  reviewName: string
  comment: string
}

interface ReplyResult {
  reviewName: string
  status: "posted" | "failed"
  errorMessage?: string
}

/**
 * POST /api/reviews/reply-batch
 * Body: { items: [{ reviewName, comment }], concurrency?: 3, delayMs?: 500 }
 *
 * 複数レビューへ返信を一括投稿する。
 * 各成功時は reviews_archive の reply_comment を即時更新（次回 sync を待たない）。
 */
export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const rl = checkRateLimit(`reply-batch:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 10,
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

  let body: { items?: ReplyItem[]; concurrency?: number; delayMs?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const items = body.items ?? []
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items array is required" }, { status: 400 })
  }
  if (items.length > 200) {
    return NextResponse.json({ error: "Too many items (max 200)" }, { status: 400 })
  }

  const concurrency = Math.min(Math.max(body.concurrency ?? 3, 1), 5)
  const delayMs = Math.max(body.delayMs ?? 500, 0)
  const client = createGmbClient(accessToken)
  const results: ReplyResult[] = new Array(items.length)

  let index = 0
  async function worker() {
    while (true) {
      const i = index++
      if (i >= items.length) break
      const item = items[i]
      if (!item.reviewName || !item.comment?.trim()) {
        results[i] = {
          reviewName: item.reviewName ?? "(missing)",
          status: "failed",
          errorMessage: "reviewName and comment required",
        }
        continue
      }
      try {
        await client.replyToReview(item.reviewName, item.comment)
        // DB スナップショットを即時更新（次の sync を待たずに状態を反映）
        await db
          .update(reviewsArchive)
          .set({
            replyComment: item.comment,
            replyUpdateTime: new Date(),
            updatedAt: sql`now()`,
          })
          .where(eq(reviewsArchive.reviewName, item.reviewName))

        results[i] = { reviewName: item.reviewName, status: "posted" }
      } catch (e) {
        results[i] = {
          reviewName: item.reviewName,
          status: "failed",
          errorMessage: e instanceof Error ? e.message.slice(0, 400) : String(e),
        }
      }
      if (delayMs > 0 && i < items.length - 1) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, worker)
    )
    const posted = results.filter((r) => r.status === "posted").length
    const failed = results.filter((r) => r.status === "failed").length
    return NextResponse.json({ results, posted, failed })
  } catch (e) {
    return errorResponse("Failed during batch reply", e)
  }
}
