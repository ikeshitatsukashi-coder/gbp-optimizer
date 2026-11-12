import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { monthlyReports, stores } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { generatePublicToken } from "@/lib/public-link"
import { buildMonthlyReport } from "@/lib/services/monthly-report"
import { currentMonth, isReportableMonth, monthBounds } from "@/lib/monthly-report-types"

/** Google から4種類の数字を読むので、少し長めに待てるようにする */
export const maxDuration = 60

/**
 * 月次レポート（社内・ログイン必須）
 *
 *   GET  ?list=1&month=YYYY-MM              店舗の一覧（その月の投稿本数・お客様用URLの有無）
 *   GET  ?locationName=...&month=YYYY-MM    1店舗のレポートをその場で集計して返す（読み取りのみ）
 *   POST { locationName, month }            お客様用URLを発行／出し直す（その時点の数字を保存）
 *   DELETE ?locationName=...&month=...      お客様用URLを止める
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

async function shareOf(locationName: string, month: string) {
  const [row] = await db
    .select({
      token: monthlyReports.token,
      revoked: monthlyReports.revoked,
      updatedAt: monthlyReports.updatedAt,
    })
    .from(monthlyReports)
    .where(and(eq(monthlyReports.locationName, locationName), eq(monthlyReports.month, month)))
  if (!row || row.revoked) return null
  return { token: row.token, updatedAt: row.updatedAt.toISOString() }
}

export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const url = new URL(request.url)
  const month = url.searchParams.get("month") ?? currentMonth()
  if (!isReportableMonth(month)) {
    return NextResponse.json({ error: "この月のレポートは出せません" }, { status: 400 })
  }

  try {
    if (url.searchParams.get("list") === "1") {
      const { start, end } = monthBounds(month)
      const rows = rowsOf(
        await db.execute(sql`
          select
            s.location_name,
            s.title,
            count(*) filter (
              where p.status = 'posted'
                and p.executed_at >= ${start.toISOString()}::timestamptz
                and p.executed_at < ${end.toISOString()}::timestamptz
            )::int as posted_in_month,
            max(p.executed_at) filter (where p.status = 'posted') as last_posted_at,
            (
              select r.token from monthly_reports r
              where r.location_name = s.location_name and r.month = ${month} and r.revoked = false
            ) as share_token,
            (
              select r.updated_at from monthly_reports r
              where r.location_name = s.location_name and r.month = ${month} and r.revoked = false
            ) as share_updated_at
          from stores s
          join scheduled_posts p on p.location_name = s.location_name
          where s.status = 'active'
          group by s.location_name, s.title
          order by s.title
        `)
      )
      return NextResponse.json({
        month,
        stores: rows.map((r) => ({
          locationName: String(r.location_name),
          title: String(r.title),
          postedInMonth: Number(r.posted_in_month ?? 0),
          lastPostedAt: r.last_posted_at ? new Date(String(r.last_posted_at)).toISOString() : null,
          shareToken: r.share_token ? String(r.share_token) : null,
          shareUpdatedAt: r.share_updated_at
            ? new Date(String(r.share_updated_at)).toISOString()
            : null,
        })),
      })
    }

    const locationName = normalizeLocation(url.searchParams.get("locationName"))
    if (!locationName) {
      return NextResponse.json({ error: "店舗を指定してください" }, { status: 400 })
    }
    const report = await buildMonthlyReport(locationName, month)
    return NextResponse.json({ report, share: await shareOf(locationName, month) })
  } catch (e) {
    return errorResponse("月次レポートを作れませんでした", e)
  }
}

export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  let body: { locationName?: string; month?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const locationName = normalizeLocation(body.locationName)
  const month = body.month ?? ""
  if (!locationName || !isReportableMonth(month)) {
    return NextResponse.json({ error: "店舗と月を指定してください" }, { status: 400 })
  }

  try {
    const [exists] = await db
      .select({ locationName: stores.locationName })
      .from(stores)
      .where(eq(stores.locationName, locationName))
    if (!exists) return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 })

    // 画面から数字を受け取らず、必ずサーバーで集計し直したものを保存する
    const report = await buildMonthlyReport(locationName, month)
    if (!report.posts && !report.insights && !report.reviews && !report.photos) {
      return NextResponse.json(
        { error: "Google から数字を読み取れなかったため、URLを発行できませんでした" },
        { status: 502 }
      )
    }
    const email = await getSessionEmail()
    const [current] = await db
      .select()
      .from(monthlyReports)
      .where(and(eq(monthlyReports.locationName, locationName), eq(monthlyReports.month, month)))

    let token: string
    if (current) {
      // 止めたURLを出し直すときは、古いURLが生き返らないよう新しいURLにする
      token = current.revoked ? generatePublicToken() : current.token
      await db
        .update(monthlyReports)
        .set({ token, snapshot: report, revoked: false, updatedAt: new Date() })
        .where(eq(monthlyReports.id, current.id))
    } else {
      token = generatePublicToken()
      await db
        .insert(monthlyReports)
        .values({ token, locationName, month, snapshot: report, createdBy: email })
    }
    return NextResponse.json({ success: true, token, updatedAt: new Date().toISOString(), report })
  } catch (e) {
    return errorResponse("お客様用URLを発行できませんでした", e)
  }
}

export async function DELETE(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const url = new URL(request.url)
  const locationName = normalizeLocation(url.searchParams.get("locationName"))
  const month = url.searchParams.get("month") ?? ""
  if (!locationName || !isReportableMonth(month)) {
    return NextResponse.json({ error: "店舗と月を指定してください" }, { status: 400 })
  }
  try {
    await db
      .update(monthlyReports)
      .set({ revoked: true, updatedAt: new Date() })
      .where(and(eq(monthlyReports.locationName, locationName), eq(monthlyReports.month, month)))
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("お客様用URLを止められませんでした", e)
  }
}
