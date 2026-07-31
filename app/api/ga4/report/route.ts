import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { socialConnections } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/ga4/report?locationId=...&days=28
 *
 * 店舗に紐づけたGA4プロパティのサイト側データを取得する。
 * GBPのインサイト（Googleマップ上の動き）と、サイトに来てからの動きを
 * 並べて見られるようにするのが目的。
 *
 * Googleログインのアクセストークンをそのまま使うため、
 * ログインしたGoogleアカウントがそのGA4プロパティの閲覧権限を持っている必要がある。
 *
 * 参照: https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
 */

const GA4_ENDPOINT = "https://analyticsdata.googleapis.com/v1beta"

function buildLocationName(locationId: string): string {
  return locationId.startsWith("locations/") ? locationId : `locations/${locationId}`
}

/** properties/123456789 の形に正規化する（数字だけ入力された場合も許容） */
function normalizeProperty(raw: string): string {
  const v = raw.trim()
  return v.startsWith("properties/") ? v : `properties/${v.replace(/^\/+/, "")}`
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

interface RunReportResponse {
  rows?: {
    dimensionValues?: { value: string }[]
    metricValues?: { value: string }[]
  }[]
}

export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const locationId = url.searchParams.get("locationId")
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "28", 10), 1), 365)
  if (!locationId) {
    return NextResponse.json({ error: "locationId が必要です" }, { status: 400 })
  }

  try {
    const [conn] = await db
      .select()
      .from(socialConnections)
      .where(
        and(
          eq(socialConnections.locationName, buildLocationName(locationId)),
          eq(socialConnections.provider, "ga4")
        )
      )
    if (!conn?.externalId) {
      return NextResponse.json(
        { error: "この店舗にGA4プロパティが登録されていません" },
        { status: 404 }
      )
    }

    const property = normalizeProperty(conn.externalId)
    const endDate = new Date()
    const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)
    const dateRanges = [{ startDate: ymd(startDate), endDate: ymd(endDate) }]

    const runReport = async (payload: Record<string, unknown>) => {
      const res = await fetch(`${GA4_ENDPOINT}/${property}:runReport`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dateRanges, ...payload }),
        cache: "no-store",
      })
      const text = await res.text()
      let data: unknown = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = null
      }
      if (!res.ok) {
        const d = data as { error?: { message?: string; status?: string } } | null
        const msg = d?.error?.message ?? `GA4 APIエラー (HTTP ${res.status})`
        const friendly =
          res.status === 403
            ? `GA4プロパティ ${property} を閲覧する権限がありません（ログイン中のGoogleアカウントに閲覧権限を付与してください）: ${msg}`
            : res.status === 401
              ? "Googleの認証が切れています。一度ログアウトして再ログインしてください（GA4のスコープ追加後は再ログインが必要です）。"
              : res.status === 400 && /property/i.test(msg)
                ? `GA4プロパティIDが正しくない可能性があります（登録値: ${conn.externalId}）: ${msg}`
                : msg
        throw new Error(friendly)
      }
      return data as RunReportResponse
    }

    // 全体サマリ / 流入元 / 日別 の3本を並列で取得
    const [summary, channels, daily] = await Promise.all([
      runReport({
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
      }),
      runReport({
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        limit: 10,
      }),
      runReport({
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        limit: 400,
      }),
    ])

    const m = summary.rows?.[0]?.metricValues ?? []
    const num = (i: number) => Number(m[i]?.value ?? 0)

    return NextResponse.json({
      property,
      days,
      range: dateRanges[0],
      summary: {
        activeUsers: num(0),
        sessions: num(1),
        pageViews: num(2),
        avgSessionDurationSec: Math.round(num(3)),
        bounceRatePct: Math.round(num(4) * 1000) / 10,
      },
      channels: (channels.rows ?? []).map((r) => ({
        channel: r.dimensionValues?.[0]?.value ?? "(不明)",
        sessions: Number(r.metricValues?.[0]?.value ?? 0),
        activeUsers: Number(r.metricValues?.[1]?.value ?? 0),
      })),
      daily: (daily.rows ?? [])
        .map((r) => {
          const raw = r.dimensionValues?.[0]?.value ?? ""
          return {
            // GA4は YYYYMMDD で返すので YYYY-MM-DD に整える
            date:
              raw.length === 8
                ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
                : raw,
            sessions: Number(r.metricValues?.[0]?.value ?? 0),
            activeUsers: Number(r.metricValues?.[1]?.value ?? 0),
          }
        })
        .sort((a, b) => a.date.localeCompare(b.date)),
    })
  } catch (e) {
    return errorResponse("Failed to fetch GA4 report", e)
  }
}
