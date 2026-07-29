import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { shareLinks, stores } from "@/lib/db/schema"
import { and, eq, desc } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { generatePublicToken } from "@/lib/public-link"
import { createGmbClient } from "@/lib/gbp-client"
import { requireRole } from "@/lib/services/authz"

/** インサイトのスナップショット取得に時間がかかるため延長 */
export const maxDuration = 60

/**
 * お客様共有リンクの管理（社内・セッション認証）
 * - 発行時にインサイトのスナップショットを取得して保存（公開ページは認証なしのため、
 *   Google API をその場で叩けない。閲覧データは発行/更新時点のもの）
 * - クチコミ・診断スコアは公開ページ側で DB からリアルタイム取得
 */

const VALID_SECTIONS = ["diagnosis", "reviews", "insights"] as const

interface ScopeStore {
  locationName: string
  title: string
}

async function resolveScopeStores(
  scopeType: string,
  locationName: string | null,
  parentCompany: string | null
): Promise<ScopeStore[]> {
  if (scopeType === "store" && locationName) {
    return db
      .select({ locationName: stores.locationName, title: stores.title })
      .from(stores)
      .where(eq(stores.locationName, locationName))
  }
  if (scopeType === "company" && parentCompany) {
    return db
      .select({ locationName: stores.locationName, title: stores.title })
      .from(stores)
      .where(and(eq(stores.parentCompany, parentCompany), eq(stores.status, "active")))
      .orderBy(stores.title)
  }
  return []
}

/** 直近6ヶ月の月次インサイトを取得してスナップショット化（最大20店舗） */
async function captureInsightsSnapshot(
  accessToken: string,
  scopeStores: ScopeStore[]
) {
  const gmb = createGmbClient(accessToken)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const end = new Date(now.getTime() - 86400000) // 昨日まで
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  const months: string[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }

  const targets = scopeStores.slice(0, 20)
  const skipped = scopeStores.length - targets.length

  interface MonthMetrics {
    impressions: number
    calls: number
    directions: number
    websiteClicks: number
  }
  const IMPRESSION_METRICS = new Set([
    "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
    "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
    "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
    "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  ])

  const results: Array<{
    locationName: string
    title: string
    monthly: Record<string, MonthMetrics>
    error?: string
  }> = []

  // 直列5並行
  const queue = [...targets]
  const workers = Array.from({ length: 5 }, async () => {
    while (queue.length > 0) {
      const store = queue.shift()
      if (!store) break
      const monthly: Record<string, MonthMetrics> = {}
      for (const m of months) {
        monthly[m] = { impressions: 0, calls: 0, directions: 0, websiteClicks: 0 }
      }
      try {
        const data = (await gmb.getInsights(
          store.locationName,
          fmt(start),
          fmt(end)
        )) as {
          multiDailyMetricTimeSeries?: Array<{
            dailyMetricTimeSeries?: Array<{
              dailyMetric?: string
              timeSeries?: {
                datedValues?: Array<{
                  date?: { year?: number; month?: number }
                  value?: string | number
                }>
              }
            }>
          }>
        }
        for (const multi of data.multiDailyMetricTimeSeries ?? []) {
          for (const series of multi.dailyMetricTimeSeries ?? []) {
            const metric = series.dailyMetric ?? ""
            for (const dv of series.timeSeries?.datedValues ?? []) {
              if (!dv.date?.year || !dv.date?.month) continue
              const key = `${dv.date.year}-${String(dv.date.month).padStart(2, "0")}`
              const bucket = monthly[key]
              if (!bucket) continue
              const v = Number(dv.value ?? 0) || 0
              if (IMPRESSION_METRICS.has(metric)) bucket.impressions += v
              else if (metric === "CALL_CLICKS") bucket.calls += v
              else if (metric === "BUSINESS_DIRECTION_REQUESTS") bucket.directions += v
              else if (metric === "WEBSITE_CLICKS") bucket.websiteClicks += v
            }
          }
        }
        results.push({ locationName: store.locationName, title: store.title, monthly })
      } catch (e) {
        results.push({
          locationName: store.locationName,
          title: store.title,
          monthly,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  })
  await Promise.all(workers)

  return {
    capturedAt: new Date().toISOString(),
    months,
    stores: results,
    skippedStores: skipped > 0 ? skipped : undefined,
  }
}

export async function GET() {
  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  try {
    const rows = await db.select().from(shareLinks).orderBy(desc(shareLinks.createdAt))
    return NextResponse.json({
      links: rows.map((l) => ({
        id: l.id,
        token: l.token,
        name: l.name,
        scopeType: l.scopeType,
        locationName: l.locationName,
        parentCompany: l.parentCompany,
        sections: l.sections,
        revoked: l.revoked,
        createdBy: l.createdBy,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        insightsCapturedAt:
          (l.insightsSnapshot as { capturedAt?: string } | null)?.capturedAt ?? null,
      })),
    })
  } catch (e) {
    return errorResponse("Failed to list share links", e)
  }
}

export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  let body: {
    name?: string
    scopeType?: string
    locationName?: string
    parentCompany?: string
    sections?: string[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const scopeType = body.scopeType === "company" ? "company" : "store"
  const sections = (body.sections ?? []).filter((s) =>
    (VALID_SECTIONS as readonly string[]).includes(s)
  )
  if (sections.length === 0) {
    return NextResponse.json({ error: "表示セクションを1つ以上選択してください" }, { status: 400 })
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "リンク名は必須です" }, { status: 400 })
  }

  const scopeStores = await resolveScopeStores(
    scopeType,
    body.locationName ?? null,
    body.parentCompany ?? null
  )
  if (scopeStores.length === 0) {
    return NextResponse.json({ error: "対象店舗が見つかりません" }, { status: 400 })
  }

  try {
    let insightsSnapshot = null
    if (sections.includes("insights")) {
      insightsSnapshot = await captureInsightsSnapshot(accessToken, scopeStores)
    }
    const email = await getSessionEmail()
    const [created] = await db
      .insert(shareLinks)
      .values({
        token: generatePublicToken(),
        name: body.name.trim(),
        scopeType,
        locationName: scopeType === "store" ? (body.locationName ?? null) : null,
        parentCompany: scopeType === "company" ? (body.parentCompany ?? null) : null,
        sections,
        insightsSnapshot,
        createdBy: email,
      })
      .returning({ id: shareLinks.id, token: shareLinks.token })
    return NextResponse.json({ success: true, ...created })
  } catch (e) {
    return errorResponse("Failed to create share link", e)
  }
}

/** PATCH ?id=&action=refresh … インサイトスナップショットを更新 */
export async function PATCH(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const url = new URL(request.url)
  const id = parseInt(url.searchParams.get("id") ?? "", 10)
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 })

  try {
    const [link] = await db.select().from(shareLinks).where(eq(shareLinks.id, id))
    if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const scopeStores = await resolveScopeStores(
      link.scopeType,
      link.locationName,
      link.parentCompany
    )
    const snapshot = link.sections.includes("insights")
      ? await captureInsightsSnapshot(accessToken, scopeStores)
      : null
    await db
      .update(shareLinks)
      .set({ insightsSnapshot: snapshot, updatedAt: new Date() })
      .where(eq(shareLinks.id, id))
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to refresh share link", e)
  }
}

/** DELETE ?id= … リンク失効（公開ページが即座に見られなくなる） */
export async function DELETE(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const url = new URL(request.url)
  const id = parseInt(url.searchParams.get("id") ?? "", 10)
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 })
  try {
    await db
      .update(shareLinks)
      .set({ revoked: true, updatedAt: new Date() })
      .where(eq(shareLinks.id, id))
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to revoke share link", e)
  }
}
