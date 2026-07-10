import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { scheduledPosts, stores } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { verifyApiKey } from "@/lib/services/api-key-auth"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

/**
 * 予約投稿の一覧・作成（APIキー認証）
 *
 * ★スコープ注: このエンドポイントは DB に「予約」を登録するだけで、
 *   Google への実投稿は行わない。実行は従来どおりツール内の
 *   「期日到来分を今すぐ実行」ボタンから人間が行う。
 */

export async function GET(request: Request) {
  const rl = checkRateLimit(`ext-sp:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 60,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const auth = await verifyApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get("status")

  try {
    const rows = await db.execute(sql`
      SELECT p.id, p.location_name, s.title AS store_name, p.scheduled_for,
             p.post_type, p.summary, p.media_urls, p.status, p.executed_at
      FROM scheduled_posts p
      INNER JOIN stores s ON s.location_name = p.location_name
      WHERE 1=1
        ${status ? sql`AND p.status = ${status}` : sql``}
      ORDER BY p.scheduled_for DESC
      LIMIT 300
    `)
    const list = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: unknown[] }).rows ?? [])
    return NextResponse.json({
      posts: (list as Array<Record<string, unknown>>).map((r) => ({
        id: r.id,
        locationName: r.location_name,
        storeName: r.store_name,
        scheduledFor: r.scheduled_for
          ? new Date(r.scheduled_for as string | Date).toISOString()
          : null,
        postType: r.post_type,
        summary: r.summary,
        mediaUrls: r.media_urls,
        status: r.status,
        executedAt: r.executed_at
          ? new Date(r.executed_at as string | Date).toISOString()
          : null,
      })),
    })
  } catch (e) {
    return errorResponse("Failed to list scheduled posts", e)
  }
}

const VALID_POST_TYPES = new Set(["STANDARD", "EVENT", "OFFER", "ALERT"])

export async function POST(request: Request) {
  const rl = checkRateLimit(`ext-sp-create:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 30,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const auth = await verifyApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  let body: {
    locationName?: string
    storeName?: string
    scheduledFor?: string
    summary?: string
    postType?: string
    mediaUrls?: string[]
    draft?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.scheduledFor || !body.summary?.trim()) {
    return NextResponse.json(
      { error: "scheduledFor, summary は必須です" },
      { status: 400 }
    )
  }

  // 店舗特定: locationName 直接 or storeName 完全一致
  let locationName: string | null = null
  if (body.locationName) {
    locationName = body.locationName.startsWith("locations/")
      ? body.locationName
      : `locations/${body.locationName}`
    const [store] = await db
      .select({ locationName: stores.locationName })
      .from(stores)
      .where(eq(stores.locationName, locationName))
    if (!store) locationName = null
  } else if (body.storeName?.trim()) {
    const [store] = await db
      .select({ locationName: stores.locationName })
      .from(stores)
      .where(eq(stores.title, body.storeName.trim()))
    locationName = store?.locationName ?? null
  }

  if (!locationName) {
    return NextResponse.json(
      {
        error:
          "店舗を特定できません。locationName（locations/xxx）または storeName（完全一致）を指定してください。",
      },
      { status: 404 }
    )
  }

  const scheduledDate = new Date(body.scheduledFor)
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "scheduledFor の日付形式が不正です" }, { status: 400 })
  }

  const postType =
    body.postType && VALID_POST_TYPES.has(body.postType.toUpperCase())
      ? body.postType.toUpperCase()
      : "STANDARD"

  try {
    const [created] = await db
      .insert(scheduledPosts)
      .values({
        locationName,
        scheduledFor: scheduledDate,
        postType,
        summary: body.summary.trim(),
        mediaUrls:
          Array.isArray(body.mediaUrls) && body.mediaUrls.length > 0
            ? body.mediaUrls.slice(0, 10)
            : null,
        status: body.draft ? "draft" : "pending",
      })
      .returning({ id: scheduledPosts.id })

    return NextResponse.json({
      success: true,
      id: created.id,
      note: "予約として登録されました。Google への実投稿はツール内の実行ボタンから行われます。",
    })
  } catch (e) {
    return errorResponse("Failed to create scheduled post", e)
  }
}
