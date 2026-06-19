import { db } from "@/lib/db"
import { reviewsArchive, stores, type NewReviewArchive } from "@/lib/db/schema"
import { createGmbClient } from "@/lib/gbp-client"
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm"

interface GoogleReview {
  name?: string | null
  reviewId?: string | null
  reviewer?: {
    displayName?: string | null
    profilePhotoUrl?: string | null
  } | null
  starRating?: string | null
  comment?: string | null
  createTime?: string | null
  updateTime?: string | null
  reviewReply?: {
    comment?: string | null
    updateTime?: string | null
  } | null
}

const STAR_MAP: Record<string, number> = {
  STAR_RATING_UNSPECIFIED: 0,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
}

function parseStarRating(value?: string | null): number | null {
  if (!value) return null
  const stripped = value.replace("STAR_RATING_", "")
  if (stripped in STAR_MAP) return STAR_MAP[stripped]
  return null
}

export interface ReviewsSyncResult {
  stores: number
  reviewsFetched: number
  inserted: number
  updated: number
  markedDeleted: number
  errors: { locationName: string; error: string }[]
  durationMs: number
}

/**
 * 1店舗のクチコミを取得して reviews_archive に UPSERT する。
 * - API から取得できた reviewName 一覧を返す（呼び出し側で「消えたクチコミ」検知に使う）
 */
async function syncSingleStore(
  accessToken: string,
  store: { locationName: string; accountName: string }
): Promise<{ reviewNames: string[]; count: number }> {
  const client = createGmbClient(accessToken)

  // v4 API はページネーション対応
  const allReviews: GoogleReview[] = []
  let pageToken: string | undefined
  do {
    const res = (await client.listReviews(
      store.accountName,
      store.locationName,
      50,
      pageToken
    )) as { reviews?: GoogleReview[]; nextPageToken?: string }
    if (Array.isArray(res.reviews)) allReviews.push(...res.reviews)
    pageToken = res.nextPageToken
  } while (pageToken)

  if (allReviews.length === 0) return { reviewNames: [], count: 0 }

  // 整形 → bulk upsert
  const rows: NewReviewArchive[] = allReviews
    .filter((r) => !!r.name)
    .map((r) => ({
      reviewName: r.name!,
      locationName: store.locationName,
      reviewer: r.reviewer?.displayName ?? null,
      reviewerProfilePhotoUrl: r.reviewer?.profilePhotoUrl ?? null,
      starRating: parseStarRating(r.starRating),
      comment: r.comment ?? null,
      createTime: r.createTime ? new Date(r.createTime) : null,
      updateTime: r.updateTime ? new Date(r.updateTime) : null,
      replyComment: r.reviewReply?.comment ?? null,
      replyUpdateTime: r.reviewReply?.updateTime
        ? new Date(r.reviewReply.updateTime)
        : null,
      archiveReason: "current",
      rawJson: r as unknown as Record<string, unknown>,
    }))

  if (rows.length === 0) return { reviewNames: [], count: 0 }

  await db
    .insert(reviewsArchive)
    .values(rows)
    .onConflictDoUpdate({
      target: reviewsArchive.reviewName,
      set: {
        reviewer: sql`excluded.reviewer`,
        reviewerProfilePhotoUrl: sql`excluded.reviewer_profile_photo_url`,
        starRating: sql`excluded.star_rating`,
        comment: sql`excluded.comment`,
        createTime: sql`excluded.create_time`,
        updateTime: sql`excluded.update_time`,
        replyComment: sql`excluded.reply_comment`,
        replyUpdateTime: sql`excluded.reply_update_time`,
        archiveReason: sql`excluded.archive_reason`,
        rawJson: sql`excluded.raw_json`,
        updatedAt: sql`now()`,
        // deletedDetectedAt は据え置き（一度 deleted になっても再出現したら current に戻す）
      },
    })

  return { reviewNames: rows.map((r) => r.reviewName), count: rows.length }
}

/**
 * 指定店舗の「DBに current として残っているが、今回の取得結果に含まれていないクチコミ」を
 * archiveReason='deleted' に更新する（投稿者削除 or Google による削除を検知）。
 */
async function markDeletedReviews(
  locationName: string,
  currentReviewNames: string[]
): Promise<number> {
  if (currentReviewNames.length === 0) {
    // 0件取得時は「全削除」とは限らない（権限・APIエラー）ので何もしない
    return 0
  }

  const result = await db
    .update(reviewsArchive)
    .set({
      archiveReason: "deleted",
      deletedDetectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reviewsArchive.locationName, locationName),
        eq(reviewsArchive.archiveReason, "current"),
        notInArray(reviewsArchive.reviewName, currentReviewNames)
      )
    )
    .returning({ reviewName: reviewsArchive.reviewName })

  return result.length
}

/**
 * Concurrency-limited Promise.all
 * 並列数を絞って Google API のレート制限に配慮する
 */
async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<(R | Error)[]> {
  const results: (R | Error)[] = new Array(items.length)
  let index = 0
  async function worker() {
    while (true) {
      const i = index++
      if (i >= items.length) break
      try {
        results[i] = await fn(items[i])
      } catch (e) {
        results[i] = e instanceof Error ? e : new Error(String(e))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * 全 active 店舗（または明示指定された店舗）のクチコミを Google から同期する。
 * 既存レコードは UPSERT、消えたクチコミは archiveReason='deleted' でマーク。
 *
 * 並列度 5 で 471店舗 × 1〜2秒 ≒ 2〜3分程度を想定
 */
export async function syncReviewsForActiveStores(
  accessToken: string,
  options?: { locationNames?: string[]; concurrency?: number }
): Promise<ReviewsSyncResult> {
  const startedAt = Date.now()
  const result: ReviewsSyncResult = {
    stores: 0,
    reviewsFetched: 0,
    inserted: 0,
    updated: 0,
    markedDeleted: 0,
    errors: [],
    durationMs: 0,
  }

  // 対象店舗を取得
  const conditions = [eq(stores.status, "active" as const)]
  const targets = options?.locationNames?.length
    ? await db
        .select({ locationName: stores.locationName, accountName: stores.accountName })
        .from(stores)
        .where(inArray(stores.locationName, options.locationNames))
    : await db
        .select({ locationName: stores.locationName, accountName: stores.accountName })
        .from(stores)
        .where(and(...conditions))

  result.stores = targets.length

  // 並列で取得
  const concurrency = options?.concurrency ?? 5
  const fetchResults = await withConcurrency(targets, concurrency, async (store) => {
    const r = await syncSingleStore(accessToken, store)
    const deletedCount = await markDeletedReviews(store.locationName, r.reviewNames)
    return { ...r, deletedCount, locationName: store.locationName }
  })

  for (let i = 0; i < fetchResults.length; i++) {
    const r = fetchResults[i]
    if (r instanceof Error) {
      result.errors.push({
        locationName: targets[i].locationName,
        error: r.message.slice(0, 500),
      })
      continue
    }
    result.reviewsFetched += r.count
    result.markedDeleted += r.deletedCount
  }

  // inserted/updated の細かい区別は省略（drizzle の returning から判定可能だが今回は合算）
  result.inserted = result.reviewsFetched
  result.durationMs = Date.now() - startedAt
  return result
}

/**
 * 削除申請バッチの候補レビューを取得：
 * - 運用中(active)店舗のクチコミ
 * - 星 ≤ 2
 * - コメント本文あり（空文字 / null は除外）
 * - archiveReason='current'（既に消えたものは対象外）
 * - 過去14日以内に申請成功してないもの（連投防止）
 */
export interface FlagCandidate {
  reviewName: string
  locationName: string
  storeName: string
  reviewer: string | null
  starRating: number | null
  comment: string | null
  createTime: Date | null
  lastFlaggedAt: Date | null
}

export async function getFlagCandidates(options?: {
  locationNames?: string[]
  storeFilter?: string
  cooldownDays?: number
}): Promise<FlagCandidate[]> {
  const cooldownDays = options?.cooldownDays ?? 14

  // ベースクエリ
  const rows = await db.execute<{
    review_name: string
    location_name: string
    store_name: string
    reviewer: string | null
    star_rating: number | null
    comment: string | null
    create_time: Date | null
    last_flagged_at: Date | null
  }>(sql`
    SELECT
      r.review_name,
      r.location_name,
      s.title AS store_name,
      r.reviewer,
      r.star_rating,
      r.comment,
      r.create_time,
      (
        SELECT MAX(f.flagged_at)
        FROM flag_history f
        WHERE f.review_name = r.review_name
          AND f.status IN ('submitted', 'approved')
      ) AS last_flagged_at
    FROM reviews_archive r
    INNER JOIN stores s ON s.location_name = r.location_name
    WHERE s.status = 'active'
      AND r.archive_reason = 'current'
      AND r.star_rating IS NOT NULL
      AND r.star_rating <= 2
      AND r.comment IS NOT NULL
      AND length(trim(r.comment)) > 0
      ${
        options?.locationNames?.length
          ? sql`AND r.location_name = ANY(${options.locationNames})`
          : sql``
      }
      ${
        options?.storeFilter
          ? sql`AND s.title ILIKE ${"%" + options.storeFilter + "%"}`
          : sql``
      }
      AND NOT EXISTS (
        SELECT 1 FROM flag_history f
        WHERE f.review_name = r.review_name
          AND f.status IN ('submitted', 'approved')
          AND f.flagged_at > now() - (${cooldownDays} || ' days')::interval
      )
    ORDER BY r.create_time DESC NULLS LAST
    LIMIT 2000
  `)

  // neon-http returns a NeonHttpQueryResult which is iterable / array-like for rows.
  // Normalize to a plain array regardless of driver variant.
  const list: Array<Record<string, unknown>> = Array.isArray(rows)
    ? (rows as Array<Record<string, unknown>>)
    : ((rows as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [])
  return list.map((row) => {
    const r = row as {
      review_name: string
      location_name: string
      store_name: string
      reviewer: string | null
      star_rating: number | null
      comment: string | null
      create_time: Date | string | null
      last_flagged_at: Date | string | null
    }
    return {
    reviewName: r.review_name,
    locationName: r.location_name,
    storeName: r.store_name,
    reviewer: r.reviewer,
    starRating: r.star_rating,
    comment: r.comment,
    createTime: r.create_time ? new Date(r.create_time) : null,
    lastFlaggedAt: r.last_flagged_at ? new Date(r.last_flagged_at) : null,
    }
  })
}

/**
 * 候補件数だけサクッと取得（バッジ・サマリー表示用）
 */
export async function countFlagCandidates(options?: {
  locationNames?: string[]
  cooldownDays?: number
}): Promise<number> {
  const candidates = await getFlagCandidates(options)
  return candidates.length
}
