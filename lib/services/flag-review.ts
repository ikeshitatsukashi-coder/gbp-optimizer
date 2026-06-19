import { db } from "@/lib/db"
import { flagHistory, reviewsArchive } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export interface FlagInput {
  reviewName: string
  reason?: string // optional context to save in errorMessage if it fails
}

export interface FlagResult {
  reviewName: string
  status: "submitted" | "already_reported" | "failed"
  errorMessage?: string
  apiResponse?: unknown
}

/**
 * 1つのレビューに削除申請を送る。
 * v4 API: POST /v4/{reviewName}:flag
 * - 成功時: flag_history に status='submitted' で記録
 * - 既報告: status='already_reported'
 * - 失敗:   status='failed' + errorMessage 保存
 *
 * このメソッドは accessToken を毎回受け取る（バッチで再利用するため）。
 */
export async function flagReview(
  accessToken: string,
  input: FlagInput
): Promise<FlagResult> {
  const { reviewName } = input

  // 申請時点でのレビュー内容をスナップショット
  const [snapshot] = await db
    .select({
      reviewer: reviewsArchive.reviewer,
      starRating: reviewsArchive.starRating,
      comment: reviewsArchive.comment,
      locationName: reviewsArchive.locationName,
    })
    .from(reviewsArchive)
    .where(eq(reviewsArchive.reviewName, reviewName))

  if (!snapshot) {
    return {
      reviewName,
      status: "failed",
      errorMessage: "Review not found in archive — re-sync reviews first",
    }
  }

  // Google v4 API へ削除申請 (flag for removal)
  const url = `https://mybusiness.googleapis.com/v4/${reviewName}:flag`
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.insert(flagHistory).values({
      reviewName,
      locationName: snapshot.locationName,
      reviewerSnapshot: snapshot.reviewer,
      starRatingSnapshot: snapshot.starRating,
      commentSnapshot: snapshot.comment,
      status: "failed",
      errorMessage: `Network error: ${msg.slice(0, 480)}`,
    })
    return { reviewName, status: "failed", errorMessage: msg }
  }

  // response body
  const rawText = await response.text()
  let parsed: unknown
  try {
    parsed = rawText ? JSON.parse(rawText) : null
  } catch {
    parsed = { rawText: rawText.slice(0, 1000) }
  }

  // 成功判定
  if (response.ok) {
    await db.insert(flagHistory).values({
      reviewName,
      locationName: snapshot.locationName,
      reviewerSnapshot: snapshot.reviewer,
      starRatingSnapshot: snapshot.starRating,
      commentSnapshot: snapshot.comment,
      status: "submitted",
      apiResponse: parsed as Record<string, unknown>,
    })
    return { reviewName, status: "submitted", apiResponse: parsed }
  }

  // 既報告判定（メッセージ文字列に依存）
  const errorMsg = JSON.stringify(parsed ?? rawText).toLowerCase()
  const alreadyReported =
    errorMsg.includes("already") &&
    (errorMsg.includes("report") || errorMsg.includes("flag"))

  const status: "already_reported" | "failed" = alreadyReported ? "already_reported" : "failed"

  await db.insert(flagHistory).values({
    reviewName,
    locationName: snapshot.locationName,
    reviewerSnapshot: snapshot.reviewer,
    starRatingSnapshot: snapshot.starRating,
    commentSnapshot: snapshot.comment,
    status,
    apiResponse: parsed as Record<string, unknown>,
    errorMessage: `HTTP ${response.status}: ${rawText.slice(0, 400)}`,
  })

  return {
    reviewName,
    status,
    errorMessage: `HTTP ${response.status}: ${rawText.slice(0, 200)}`,
    apiResponse: parsed,
  }
}

/**
 * 複数レビューを順次削除申請（API レート制限考慮で並列度を絞る）
 */
export async function flagReviewsBatch(
  accessToken: string,
  reviewNames: string[],
  options?: { concurrency?: number; delayMs?: number }
): Promise<FlagResult[]> {
  const concurrency = options?.concurrency ?? 3
  const delayMs = options?.delayMs ?? 500
  const results: FlagResult[] = new Array(reviewNames.length)
  let index = 0

  async function worker() {
    while (true) {
      const i = index++
      if (i >= reviewNames.length) break
      const reviewName = reviewNames[i]
      try {
        results[i] = await flagReview(accessToken, { reviewName })
      } catch (e) {
        results[i] = {
          reviewName,
          status: "failed",
          errorMessage: e instanceof Error ? e.message : String(e),
        }
      }
      if (delayMs > 0 && i < reviewNames.length - 1) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, reviewNames.length) }, worker)
  )
  return results
}
