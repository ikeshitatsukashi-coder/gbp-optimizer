import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { storeFeatures, stores } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { trackingBaseUrl } from "@/lib/services/post-click-tracking"

/**
 * 投稿ボタンのクリック数（社内・ログイン必須）
 *
 *   GET                       店舗の一覧（計測のON/OFF・クリック数）
 *   GET ?locationName=...     その店舗の、計測した投稿ごとのクリック数
 *   PATCH { locationName, enabled }   計測のON/OFFを切り替える
 *
 * ONにした店舗だけ、これから実行される予約投稿のボタンが計測用のURLになる。
 * すでに公開済みの投稿や、予約の中身そのものは書き換えない。
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

/** 日本時間のきょうから n 日前の日付（YYYY-MM-DD） */
function jstDay(daysAgo: number): string {
  return new Date(Date.now() + 9 * 3600e3 - daysAgo * 86400e3).toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const rawLocation = new URL(request.url).searchParams.get("locationName")

  try {
    if (rawLocation) {
      const locationName = normalizeLocation(rawLocation)
      if (!locationName) {
        return NextResponse.json({ error: "店舗の指定が正しくありません" }, { status: 400 })
      }
      const rows = rowsOf(
        await db.execute(sql`
          select
            l.id,
            l.target_url,
            p.id as post_id,
            p.summary,
            p.status,
            p.executed_at,
            p.scheduled_for,
            p.call_to_action->>'actionType' as action_type,
            p.result->>'clickTracking' as tracking,
            coalesce((select sum(c.clicks) from tracked_link_clicks c
                        where c.link_id = l.id), 0)::int as clicks,
            coalesce((select sum(c.clicks) from tracked_link_clicks c
                        where c.link_id = l.id and c.day >= ${jstDay(6)}), 0)::int as clicks_7d
          from tracked_links l
          left join scheduled_posts p
            on l.label = 'sp-' || p.id::text and p.location_name = l.location_name
          where l.location_name = ${locationName} and l.label like 'sp-%'
          order by coalesce(p.executed_at, p.scheduled_for, l.created_at) desc
          limit 200
        `)
      )
      return NextResponse.json({
        posts: rows.map((r) => ({
          linkId: Number(r.id),
          postId: r.post_id == null ? null : Number(r.post_id),
          summary: r.summary ? String(r.summary).slice(0, 80) : null,
          status: r.status ? String(r.status) : null,
          executedAt: iso(r.executed_at),
          scheduledFor: iso(r.scheduled_for),
          actionType: r.action_type ? String(r.action_type) : null,
          targetUrl: String(r.target_url),
          /** on = 計測用URLで公開された / fallback = 計測用URLが通らず、元のURLで公開された */
          tracking: r.tracking ? String(r.tracking) : null,
          clicks: Number(r.clicks ?? 0),
          clicks7d: Number(r.clicks_7d ?? 0),
        })),
      })
    }

    const rows = rowsOf(
      await db.execute(sql`
        select
          s.location_name,
          s.title,
          coalesce(f.track_post_clicks, false) as tracking_on,
          (select count(*)::int from scheduled_posts p
             where p.location_name = s.location_name and p.status = 'pending'
               and coalesce(p.call_to_action->>'url', '') <> '') as pending_with_button,
          (select count(*)::int from scheduled_posts p
             where p.location_name = s.location_name and p.status = 'posted'
               and p.result->>'clickTracking' = 'on') as tracked_posts,
          coalesce((select sum(c.clicks) from tracked_links l
                      join tracked_link_clicks c on c.link_id = l.id
                     where l.location_name = s.location_name and l.label like 'sp-%'), 0)::int
            as clicks_total,
          coalesce((select sum(c.clicks) from tracked_links l
                      join tracked_link_clicks c on c.link_id = l.id
                     where l.location_name = s.location_name and l.label like 'sp-%'
                       and c.day >= ${jstDay(29)}), 0)::int as clicks_30d
        from stores s
        left join store_features f on f.location_name = s.location_name
        where s.status = 'active'
          and exists (select 1 from scheduled_posts p where p.location_name = s.location_name)
        order by s.title
      `)
    )
    return NextResponse.json({
      /** 計測用URLを作れる環境か（本番のみ） */
      ready: !!trackingBaseUrl(),
      stores: rows.map((r) => ({
        locationName: String(r.location_name),
        title: String(r.title),
        trackingOn: r.tracking_on === true,
        pendingWithButton: Number(r.pending_with_button ?? 0),
        trackedPosts: Number(r.tracked_posts ?? 0),
        clicksTotal: Number(r.clicks_total ?? 0),
        clicks30d: Number(r.clicks_30d ?? 0),
      })),
    })
  } catch (e) {
    return errorResponse("クリック数を読み込めませんでした", e)
  }
}

export async function PATCH(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  let body: { locationName?: string; enabled?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const locationName = normalizeLocation(body.locationName)
  if (!locationName || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "店舗と、ON/OFFを指定してください" }, { status: 400 })
  }
  try {
    const [store] = await db
      .select({ locationName: stores.locationName })
      .from(stores)
      .where(eq(stores.locationName, locationName))
    if (!store) return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 })

    const email = await getSessionEmail()
    await db
      .insert(storeFeatures)
      .values({ locationName, trackPostClicks: body.enabled, updatedBy: email })
      .onConflictDoUpdate({
        target: storeFeatures.locationName,
        set: { trackPostClicks: body.enabled, updatedBy: email, updatedAt: new Date() },
      })
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("切り替えられませんでした", e)
  }
}
