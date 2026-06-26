import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { scheduledPosts, stores } from "@/lib/db/schema"
import { getAccessToken } from "@/lib/get-session"
import { eq, sql, and } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/scheduled-posts
 *   ?status=pending|posted|failed
 *   ?locationName=...
 */
export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get("status")
  const locationName = url.searchParams.get("locationName")

  try {
    const rows = await db.execute(sql`
      SELECT
        p.id,
        p.location_name,
        s.title AS store_name,
        p.scheduled_for,
        p.post_type,
        p.summary,
        p.media_urls,
        p.call_to_action,
        p.status,
        p.executed_at,
        p.error_message,
        p.created_at
      FROM scheduled_posts p
      INNER JOIN stores s ON s.location_name = p.location_name
      WHERE 1=1
        ${status ? sql`AND p.status = ${status}` : sql``}
        ${locationName ? sql`AND p.location_name = ${locationName}` : sql``}
      ORDER BY p.scheduled_for DESC
      LIMIT 500
    `)

    const list = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: unknown[] }).rows ?? [])

    return NextResponse.json({
      posts: (list as Array<Record<string, unknown>>).map((row) => ({
        id: row.id,
        locationName: row.location_name,
        storeName: row.store_name,
        scheduledFor: row.scheduled_for
          ? new Date(row.scheduled_for as string | Date).toISOString()
          : null,
        postType: row.post_type,
        summary: row.summary,
        mediaUrls: row.media_urls,
        callToAction: row.call_to_action,
        status: row.status,
        executedAt: row.executed_at
          ? new Date(row.executed_at as string | Date).toISOString()
          : null,
        errorMessage: row.error_message,
        createdAt: new Date(row.created_at as string | Date).toISOString(),
      })),
    })
  } catch (e) {
    return errorResponse("Failed to fetch scheduled posts", e)
  }
}

/**
 * POST /api/scheduled-posts
 * Body: {
 *   locationName: string,
 *   scheduledFor: ISO date,
 *   summary: string,
 *   postType?: "STANDARD" | "EVENT" | "OFFER" | "ALERT",
 *   mediaUrl?: string,
 *   callToAction?: { actionType: string, url: string }
 * }
 */
export async function POST(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: {
    locationName?: string
    scheduledFor?: string
    summary?: string
    postType?: string
    mediaUrl?: string
    callToAction?: { actionType: string; url: string }
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.locationName || !body.scheduledFor || !body.summary?.trim()) {
    return NextResponse.json(
      { error: "locationName, scheduledFor, summary are required" },
      { status: 400 }
    )
  }

  const scheduledDate = new Date(body.scheduledFor)
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "Invalid scheduledFor date" }, { status: 400 })
  }

  // 店舗が DB に存在するか確認
  const [store] = await db
    .select({ locationName: stores.locationName })
    .from(stores)
    .where(eq(stores.locationName, body.locationName))
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 })
  }

  try {
    const [created] = await db
      .insert(scheduledPosts)
      .values({
        locationName: body.locationName,
        scheduledFor: scheduledDate,
        postType: body.postType ?? "STANDARD",
        summary: body.summary.trim(),
        mediaUrls: body.mediaUrl ? [body.mediaUrl] : null,
        callToAction: body.callToAction ?? null,
        status: "pending",
      })
      .returning({ id: scheduledPosts.id })

    return NextResponse.json({ success: true, id: created.id })
  } catch (e) {
    return errorResponse("Failed to schedule post", e)
  }
}

/**
 * DELETE /api/scheduled-posts?id=N
 */
export async function DELETE(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  try {
    const result = await db
      .delete(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.id, parseInt(id, 10)),
          eq(scheduledPosts.status, "pending")
        )
      )
      .returning({ id: scheduledPosts.id })

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Not found or already executed" },
        { status: 404 }
      )
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to delete scheduled post", e)
  }
}
