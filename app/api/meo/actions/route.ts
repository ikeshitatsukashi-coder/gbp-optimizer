import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { meoActions, stores } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { createGmbClient } from "@/lib/gbp-client"
import { withGoogleRead } from "@/lib/services/google-read"
import { MEO_CHECKS } from "@/lib/meo-types"

export const maxDuration = 60

/**
 * MEO 対策の記録と、前後の数字の比較（社内・ログイン必須）
 *
 *   GET                 記録の一覧
 *   GET ?id=...         その対策の「前」と「後」の数字（Google から読む・読み取りのみ）
 *   POST { locationName, actionDate, kind, note }   記録を追加
 *   DELETE ?id=...      記録を削除
 *
 * ここは記録を付けるだけで、Google のプロフィールには何も書き込まない。
 */

const JST = 9 * 3600e3
/** Google の集計が届くまでの日数（この日数ぶん、直近は比べる対象から外す） */
const LAG_DAYS = 3
/** 比べる長さ（最大）。4週間＝曜日の偏りが出ない長さ */
const WINDOW_DAYS = 28

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (day: string, n: number) => ymd(new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400e3))

interface Totals {
  impressions: number
  websiteClicks: number
  directions: number
  calls: number
}
const zero = (): Totals => ({ impressions: 0, websiteClicks: 0, directions: 0, calls: 0 })

async function compare(locationName: string, actionDate: string) {
  const today = ymd(new Date(Date.now() + JST))
  const lastAvailable = addDays(today, -LAG_DAYS)
  const afterStart = addDays(actionDate, 1)
  const afterEndMax = addDays(actionDate, WINDOW_DAYS)
  const afterEnd = afterEndMax < lastAvailable ? afterEndMax : lastAvailable
  const days =
    afterEnd >= afterStart
      ? Math.round(
          (new Date(`${afterEnd}T00:00:00Z`).getTime() - new Date(`${afterStart}T00:00:00Z`).getTime()) /
            86400e3
        ) + 1
      : 0
  if (days <= 0) {
    return { days: 0, readyOn: addDays(actionDate, 1 + LAG_DAYS), before: null, after: null }
  }
  const beforeEnd = addDays(actionDate, -1)
  const beforeStart = addDays(actionDate, -days)

  const data = (await withGoogleRead((token) =>
    createGmbClient(token).getInsights(locationName, beforeStart, afterEnd)
  )) as {
    multiDailyMetricTimeSeries?: {
      dailyMetricTimeSeries?: {
        dailyMetric?: string
        timeSeries?: {
          datedValues?: { date?: { year?: number; month?: number; day?: number }; value?: string }[]
        }
      }[]
    }[]
  }
  const before = zero()
  const after = zero()
  for (const multi of data.multiDailyMetricTimeSeries ?? []) {
    for (const series of multi.dailyMetricTimeSeries ?? []) {
      const metric = series.dailyMetric ?? ""
      const key: keyof Totals | null = metric.startsWith("BUSINESS_IMPRESSIONS_")
        ? "impressions"
        : metric === "WEBSITE_CLICKS"
          ? "websiteClicks"
          : metric === "BUSINESS_DIRECTION_REQUESTS"
            ? "directions"
            : metric === "CALL_CLICKS"
              ? "calls"
              : null
      if (!key) continue
      for (const dv of series.timeSeries?.datedValues ?? []) {
        const d = dv.date
        if (!d?.year || !d.month || !d.day) continue
        const day = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
        const v = Number(dv.value ?? 0) || 0
        if (day >= beforeStart && day <= beforeEnd) before[key] += v
        else if (day >= afterStart && day <= afterEnd) after[key] += v
      }
    }
  }
  return {
    days,
    /** 4週間ぶんそろったか（そろうまでは途中経過） */
    complete: days >= WINDOW_DAYS,
    beforeRange: { start: beforeStart, end: beforeEnd },
    afterRange: { start: afterStart, end: afterEnd },
    before,
    after,
  }
}

export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const idRaw = new URL(request.url).searchParams.get("id")
  try {
    if (idRaw) {
      const id = parseInt(idRaw, 10)
      const [row] = await db.select().from(meoActions).where(eq(meoActions.id, id))
      if (!row) return NextResponse.json({ error: "記録が見つかりません" }, { status: 404 })
      return NextResponse.json({ id, ...(await compare(row.locationName, row.actionDate)) })
    }
    const rows = await db
      .select({
        id: meoActions.id,
        locationName: meoActions.locationName,
        title: stores.title,
        actionDate: meoActions.actionDate,
        kind: meoActions.kind,
        note: meoActions.note,
        createdBy: meoActions.createdBy,
        createdAt: meoActions.createdAt,
      })
      .from(meoActions)
      .innerJoin(stores, eq(stores.locationName, meoActions.locationName))
      .orderBy(desc(meoActions.actionDate), desc(meoActions.id))
      .limit(300)
    return NextResponse.json({
      today: ymd(new Date(Date.now() + JST)),
      actions: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    })
  } catch (e) {
    return errorResponse("記録を読み込めませんでした", e)
  }
}

export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  let body: { locationName?: string; actionDate?: string; kind?: string; note?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const locId = (body.locationName ?? "").replace(/^locations\//, "")
  const today = ymd(new Date(Date.now() + JST))
  const actionDate = body.actionDate ?? today
  const kind = body.kind ?? "other"
  if (
    !/^\d{1,30}$/.test(locId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(actionDate) ||
    actionDate > today ||
    actionDate < addDays(today, -500) ||
    !(kind === "other" || MEO_CHECKS.some((c) => c.id === kind))
  ) {
    return NextResponse.json(
      { error: "店舗・日付（きょう以前）・対策の種類を指定してください" },
      { status: 400 }
    )
  }
  try {
    const locationName = `locations/${locId}`
    const [store] = await db
      .select({ locationName: stores.locationName })
      .from(stores)
      .where(eq(stores.locationName, locationName))
    if (!store) return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 })
    const [created] = await db
      .insert(meoActions)
      .values({
        locationName,
        actionDate,
        kind,
        note: (body.note ?? "").trim().slice(0, 500) || null,
        createdBy: await getSessionEmail(),
      })
      .returning({ id: meoActions.id })
    return NextResponse.json({ success: true, id: created.id })
  } catch (e) {
    return errorResponse("記録できませんでした", e)
  }
}

export async function DELETE(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied
  const id = parseInt(new URL(request.url).searchParams.get("id") ?? "", 10)
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 })
  try {
    await db.delete(meoActions).where(eq(meoActions.id, id))
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("削除できませんでした", e)
  }
}
