import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reviewExclusions, reviewsArchive } from "@/lib/db/schema"
import { getAccessToken } from "@/lib/get-session"
import { and, eq, sql } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/reviews/exclusions
 *   ?storeFilter=...
 */
export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const storeFilter = url.searchParams.get("storeFilter")?.trim()

  try {
    const rows = await db.execute(sql`
      SELECT
        e.id,
        e.review_name,
        e.location_name,
        s.title AS store_name,
        e.reviewer_name,
        e.create_time,
        e.exclude_auto_reply,
        e.exclude_auto_flag,
        e.reason,
        e.created_at,
        r.comment AS review_comment,
        r.star_rating
      FROM review_exclusions e
      INNER JOIN stores s ON s.location_name = e.location_name
      LEFT JOIN reviews_archive r ON r.review_name = e.review_name
      WHERE 1=1
        ${storeFilter ? sql`AND s.title ILIKE ${"%" + storeFilter + "%"}` : sql``}
      ORDER BY e.created_at DESC
      LIMIT 1000
    `)

    const list = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: unknown[] }).rows ?? [])

    interface Row {
      id: number
      review_name: string | null
      location_name: string
      store_name: string
      reviewer_name: string | null
      create_time: Date | string | null
      exclude_auto_reply: boolean
      exclude_auto_flag: boolean
      reason: string | null
      created_at: Date | string
      review_comment: string | null
      star_rating: number | null
    }

    const exclusions = (list as Array<Record<string, unknown>>).map((row) => {
      const r = row as unknown as Row
      return {
        id: r.id,
        reviewName: r.review_name,
        locationName: r.location_name,
        storeName: r.store_name,
        reviewerName: r.reviewer_name,
        createTime: r.create_time ? new Date(r.create_time).toISOString() : null,
        excludeAutoReply: r.exclude_auto_reply,
        excludeAutoFlag: r.exclude_auto_flag,
        reason: r.reason,
        createdAt: new Date(r.created_at).toISOString(),
        reviewComment: r.review_comment,
        starRating: r.star_rating,
      }
    })

    return NextResponse.json({ exclusions, total: exclusions.length })
  } catch (e) {
    return errorResponse("Failed to fetch exclusions", e)
  }
}

/**
 * POST /api/reviews/exclusions
 * Body: {
 *   reviewName: string,
 *   excludeAutoReply?: boolean (default true),
 *   excludeAutoFlag?: boolean (default true),
 *   reason?: string
 * }
 *
 * 指定レビューを除外リストに追加（既に存在すれば更新）。
 */
export async function POST(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: {
    reviewName?: string
    excludeAutoReply?: boolean
    excludeAutoFlag?: boolean
    reason?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.reviewName) {
    return NextResponse.json({ error: "reviewName is required" }, { status: 400 })
  }

  try {
    // DB のレビュースナップショットから店舗・投稿者・投稿日時を取る
    const [snapshot] = await db
      .select({
        locationName: reviewsArchive.locationName,
        reviewer: reviewsArchive.reviewer,
        createTime: reviewsArchive.createTime,
      })
      .from(reviewsArchive)
      .where(eq(reviewsArchive.reviewName, body.reviewName))

    if (!snapshot) {
      return NextResponse.json(
        { error: "Review not found in archive" },
        { status: 404 }
      )
    }

    await db
      .insert(reviewExclusions)
      .values({
        locationName: snapshot.locationName,
        reviewName: body.reviewName,
        reviewerName: snapshot.reviewer,
        createTime: snapshot.createTime,
        excludeAutoReply: body.excludeAutoReply ?? true,
        excludeAutoFlag: body.excludeAutoFlag ?? true,
        reason: body.reason ?? null,
      })
      .onConflictDoUpdate({
        target: reviewExclusions.reviewName,
        set: {
          excludeAutoReply: body.excludeAutoReply ?? true,
          excludeAutoFlag: body.excludeAutoFlag ?? true,
          reason: body.reason ?? null,
        },
      })

    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to add exclusion", e)
  }
}

/**
 * DELETE /api/reviews/exclusions?id=N または ?reviewName=...
 */
export async function DELETE(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  const reviewName = url.searchParams.get("reviewName")

  if (!id && !reviewName) {
    return NextResponse.json({ error: "id or reviewName is required" }, { status: 400 })
  }

  try {
    const where = id
      ? eq(reviewExclusions.id, parseInt(id, 10))
      : eq(reviewExclusions.reviewName, reviewName!)
    const result = await db.delete(reviewExclusions).where(where).returning({ id: reviewExclusions.id })

    return NextResponse.json({ success: true, deleted: result.length })
  } catch (e) {
    return errorResponse("Failed to delete exclusion", e)
  }
}

/**
 * PATCH /api/reviews/exclusions?id=N
 * Body: { excludeAutoReply?: boolean, excludeAutoFlag?: boolean, reason?: string }
 */
export async function PATCH(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  let body: { excludeAutoReply?: boolean; excludeAutoFlag?: boolean; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const patch: Record<string, unknown> = {}
    if (typeof body.excludeAutoReply === "boolean") patch.excludeAutoReply = body.excludeAutoReply
    if (typeof body.excludeAutoFlag === "boolean") patch.excludeAutoFlag = body.excludeAutoFlag
    if (typeof body.reason === "string" || body.reason === null) patch.reason = body.reason

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 })
    }

    const result = await db
      .update(reviewExclusions)
      .set(patch)
      .where(eq(reviewExclusions.id, parseInt(id, 10)))
      .returning({ id: reviewExclusions.id })

    return NextResponse.json({ success: true, updated: result.length })
  } catch (e) {
    return errorResponse("Failed to update exclusion", e)
  }
}
