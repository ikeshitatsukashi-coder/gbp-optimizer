import { NextResponse } from "next/server"
import { del } from "@vercel/blob"
import { db } from "@/lib/db"
import { photoIntakeLinks, photoIntakeUploads, stores } from "@/lib/db/schema"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { generatePublicToken } from "@/lib/public-link"

/**
 * お客様用の写真受付ページの管理（社内・ログイン必須）
 *
 *   GET                         店舗の一覧（受付URLの有無・届いた枚数・未確認の枚数）
 *   GET  ?locationName=...      その店舗に届いた写真の一覧
 *   POST { locationName }       受付URLを発行（止めていた場合は再開）
 *   PATCH { locationName, enabled }      受付を止める／再開する
 *   PATCH { locationName, rotate: true } URLを作り直す（古いURLは使えなくなる）
 *   PATCH { locationName, markSeen: true } 届いた写真を「確認済み」にする
 *   DELETE ?id=...              届いた写真を1枚削除（保管場所からも消す）
 *
 * 届いた写真は、画像アーカイブと同じ保管場所の、その店舗（会社）のフォルダに入る。
 * そのため投稿の画面の「画像アーカイブ」からそのまま選べる。
 */

function rowsOf(r: unknown): Record<string, unknown>[] {
  return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[]
}

function normalizeLocation(raw: string | null | undefined): string | null {
  const id = (raw ?? "").replace(/^locations\//, "")
  return /^\d{1,30}$/.test(id) ? `locations/${id}` : null
}

const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null)

export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const url = new URL(request.url)
  const rawLocation = url.searchParams.get("locationName")

  try {
    if (rawLocation) {
      const locationName = normalizeLocation(rawLocation)
      if (!locationName) {
        return NextResponse.json({ error: "店舗の指定が正しくありません" }, { status: 400 })
      }
      const uploads = await db
        .select()
        .from(photoIntakeUploads)
        .where(eq(photoIntakeUploads.locationName, locationName))
        .orderBy(desc(photoIntakeUploads.createdAt))
        .limit(300)
      return NextResponse.json({
        uploads: uploads.map((u) => ({
          id: u.id,
          url: u.url,
          fileName: u.fileName,
          senderName: u.senderName,
          note: u.note,
          seen: !!u.seenAt,
          createdAt: u.createdAt.toISOString(),
        })),
      })
    }

    const rows = rowsOf(
      await db.execute(sql`
        select
          s.location_name,
          s.title,
          l.token,
          l.enabled,
          (select count(*)::int from photo_intake_uploads u
             where u.location_name = s.location_name) as total,
          (select count(*)::int from photo_intake_uploads u
             where u.location_name = s.location_name and u.seen_at is null) as unseen,
          (select max(u.created_at) from photo_intake_uploads u
             where u.location_name = s.location_name) as last_at
        from stores s
        left join photo_intake_links l on l.location_name = s.location_name
        where s.status = 'active'
          and (
            l.id is not null
            or exists (select 1 from scheduled_posts p where p.location_name = s.location_name)
          )
        order by s.title
      `)
    )
    return NextResponse.json({
      stores: rows.map((r) => ({
        locationName: String(r.location_name),
        title: String(r.title),
        token: r.token ? String(r.token) : null,
        enabled: r.token ? r.enabled === true : false,
        total: Number(r.total ?? 0),
        unseen: Number(r.unseen ?? 0),
        lastAt: iso(r.last_at),
      })),
    })
  } catch (e) {
    return errorResponse("写真の受付状況を読み込めませんでした", e)
  }
}

export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  let body: { locationName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const locationName = normalizeLocation(body.locationName)
  if (!locationName) {
    return NextResponse.json({ error: "店舗を指定してください" }, { status: 400 })
  }
  try {
    const [store] = await db
      .select({ locationName: stores.locationName })
      .from(stores)
      .where(eq(stores.locationName, locationName))
    if (!store) return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 })

    const [current] = await db
      .select()
      .from(photoIntakeLinks)
      .where(eq(photoIntakeLinks.locationName, locationName))
    if (current) {
      if (!current.enabled) {
        await db
          .update(photoIntakeLinks)
          .set({ enabled: true, updatedAt: new Date() })
          .where(eq(photoIntakeLinks.id, current.id))
      }
      return NextResponse.json({ success: true, token: current.token })
    }
    const token = generatePublicToken()
    await db
      .insert(photoIntakeLinks)
      .values({ token, locationName, createdBy: await getSessionEmail() })
    return NextResponse.json({ success: true, token })
  } catch (e) {
    return errorResponse("受付URLを発行できませんでした", e)
  }
}

export async function PATCH(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  let body: { locationName?: string; enabled?: boolean; rotate?: boolean; markSeen?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const locationName = normalizeLocation(body.locationName)
  if (!locationName) {
    return NextResponse.json({ error: "店舗を指定してください" }, { status: 400 })
  }
  try {
    if (body.markSeen) {
      await db
        .update(photoIntakeUploads)
        .set({ seenAt: new Date() })
        .where(
          and(eq(photoIntakeUploads.locationName, locationName), isNull(photoIntakeUploads.seenAt))
        )
      return NextResponse.json({ success: true })
    }
    if (body.rotate) {
      const token = generatePublicToken()
      const updated = await db
        .update(photoIntakeLinks)
        .set({ token, enabled: true, updatedAt: new Date() })
        .where(eq(photoIntakeLinks.locationName, locationName))
        .returning({ id: photoIntakeLinks.id })
      if (updated.length === 0) {
        return NextResponse.json({ error: "受付URLがまだ発行されていません" }, { status: 404 })
      }
      return NextResponse.json({ success: true, token })
    }
    if (typeof body.enabled === "boolean") {
      await db
        .update(photoIntakeLinks)
        .set({ enabled: body.enabled, updatedAt: new Date() })
        .where(eq(photoIntakeLinks.locationName, locationName))
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: "変更内容がありません" }, { status: 400 })
  } catch (e) {
    return errorResponse("変更できませんでした", e)
  }
}

export async function DELETE(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const id = parseInt(new URL(request.url).searchParams.get("id") ?? "", 10)
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 })
  try {
    const [row] = await db.select().from(photoIntakeUploads).where(eq(photoIntakeUploads.id, id))
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
    // 保管場所のファイルも消す（消せなくても記録は消して一覧から外す）
    if (row.url.includes("blob.vercel-storage.com")) {
      await del(row.url).catch(() => {})
    }
    await db.delete(photoIntakeUploads).where(eq(photoIntakeUploads.id, id))
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("削除できませんでした", e)
  }
}
