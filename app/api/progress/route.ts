import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { appSettings } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { getCronAuthStatus, getServiceAccessToken } from "@/lib/services/cron-auth"

/**
 * GET /api/progress
 *
 * 投稿の進捗確認（読み取りのみ）。
 * 「どの店舗の投稿が何日止まっているか」「予約がいつ尽きるか」「自動投稿が動いているか」を返す。
 *
 *   ?includeEmpty=1  投稿の登録が1件も無い店舗の一覧も返す
 *
 * 対象は「運用中（active）かつ、予約か投稿が1件以上ある店舗」。
 * 契約が終わった店舗は、店舗マスタでステータスを休止・解約にすると一覧から外れる。
 */

function rowsOf(r: unknown): Record<string, unknown>[] {
  return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[]
}

function iso(v: unknown): string | null {
  if (!v) return null
  const d = new Date(v as string | Date)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const includeEmpty = new URL(request.url).searchParams.get("includeEmpty") === "1"

  try {
    const [storeRows, totalsRows, emptyCountRows, lastRunRows, authStatus, svc] =
      await Promise.all([
        // 店舗ごとの投稿状況
        db.execute(sql`
          select
            s.location_name,
            s.title,
            max(p.executed_at) filter (where p.status = 'posted') as last_posted_at,
            count(*) filter (
              where p.status = 'posted' and p.executed_at > now() - interval '30 days'
            )::int as posted_30d,
            min(p.scheduled_for) filter (where p.status = 'pending') as next_scheduled_for,
            max(p.scheduled_for) filter (where p.status = 'pending') as last_scheduled_for,
            count(*) filter (where p.status = 'pending')::int as pending_count,
            count(*) filter (
              where p.status = 'pending' and p.scheduled_for < now() - interval '6 hours'
            )::int as overdue_count,
            count(*) filter (where p.status = 'failed')::int as failed_count,
            max(p.executed_at) filter (where p.status = 'failed') as last_failed_at,
            count(*) filter (where p.status = 'draft')::int as draft_count
          from stores s
          join scheduled_posts p on p.location_name = s.location_name
          where s.status = 'active'
          group by s.location_name, s.title
          order by s.title
        `),
        // 全体の件数
        db.execute(sql`
          select
            count(*) filter (
              where status = 'pending' and scheduled_for < now() - interval '6 hours'
            )::int as overdue,
            count(*) filter (where status = 'failed')::int as failed,
            count(*) filter (where status = 'pending')::int as pending,
            max(executed_at) filter (where status = 'posted') as last_posted_at
          from scheduled_posts
        `),
        // 投稿の登録が1件も無い店舗（運用中・運用対象のみ）
        db.execute(sql`
          select count(*)::int as n
          from stores s
          where s.status = 'active'
            and (s.has_voice_of_merchant is null or s.has_voice_of_merchant = true)
            and s.duplicate_of is null
            and not exists (select 1 from scheduled_posts p where p.location_name = s.location_name)
        `),
        db.select().from(appSettings).where(eq(appSettings.key, "execute_last_run")),
        getCronAuthStatus(),
        // 保存済みの認証が今も使えるかを、実際に更新して確かめる（読み取りのみ）
        getServiceAccessToken(),
      ])

    let emptyStores: { locationName: string; title: string }[] | undefined
    if (includeEmpty) {
      emptyStores = rowsOf(
        await db.execute(sql`
          select s.location_name, s.title
          from stores s
          where s.status = 'active'
            and (s.has_voice_of_merchant is null or s.has_voice_of_merchant = true)
            and s.duplicate_of is null
            and not exists (select 1 from scheduled_posts p where p.location_name = s.location_name)
          order by s.title
        `)
      ).map((r) => ({ locationName: String(r.location_name), title: String(r.title) }))
    }

    let lastRun: Record<string, unknown> | null = null
    try {
      lastRun = lastRunRows[0] ? (JSON.parse(lastRunRows[0].value) as Record<string, unknown>) : null
    } catch {
      lastRun = null
    }

    const totals = rowsOf(totalsRows)[0] ?? {}

    return NextResponse.json({
      now: new Date().toISOString(),
      auto: {
        /** 「自動実行を有効化」が済んでいるか */
        configured: authStatus.configured,
        savedBy: authStatus.savedBy ?? null,
        /** 保存済みの認証が今も通るか */
        authOk: !!svc.accessToken,
        authError: svc.accessToken ? null : svc.reason,
        /** 最後の実行（定時実行・画面からの実行のどちらも） */
        lastRun,
        /** 予約時刻を6時間以上過ぎても実行されていない件数 */
        overdue: Number(totals.overdue ?? 0),
        /** 失敗のまま残っている投稿の件数 */
        failed: Number(totals.failed ?? 0),
        pending: Number(totals.pending ?? 0),
        lastPostedAt: iso(totals.last_posted_at),
      },
      stores: rowsOf(storeRows).map((r) => ({
        locationName: String(r.location_name),
        title: String(r.title),
        lastPostedAt: iso(r.last_posted_at),
        posted30d: Number(r.posted_30d ?? 0),
        nextScheduledFor: iso(r.next_scheduled_for),
        lastScheduledFor: iso(r.last_scheduled_for),
        pendingCount: Number(r.pending_count ?? 0),
        overdueCount: Number(r.overdue_count ?? 0),
        failedCount: Number(r.failed_count ?? 0),
        lastFailedAt: iso(r.last_failed_at),
        draftCount: Number(r.draft_count ?? 0),
      })),
      /** 投稿の登録が1件も無い店舗の数 */
      emptyStoreCount: Number(rowsOf(emptyCountRows)[0]?.n ?? 0),
      emptyStores,
    })
  } catch (e) {
    return errorResponse("Failed to load progress", e)
  }
}
