import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { db } from "@/lib/db"
import { stores, trackedLinks, trackedLinkClicks } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { verifyApiKey } from "@/lib/services/api-key-auth"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

/**
 * 計測リンク（APIキー認証）
 *   POST /api/ext/links  { locationId, label, targetUrl }  → { token, url }
 *        同じ店舗・同じ label・同じ転送先なら、作り直さず既存のリンクを返す
 *   GET  /api/ext/links?locationId=xxx  → [{ label, url, targetUrl, total, daily: { 'YYYY-MM-DD': n } }]
 * 外部ツールが動画ごとの「最新情報」投稿のボタンに付け、動画ごとのクリック数をABテストに使う。
 */
function publicUrl(request: Request, token: string) {
  const base = process.env.NEXTAUTH_URL ?? new URL(request.url).origin
  return `${base.replace(/\/+$/, "")}/api/public/r/${token}`
}

async function guard(request: Request, key: string) {
  const rl = checkRateLimit(`${key}:${getClientId(request)}`, { windowMs: 60_000, max: 60 })
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  const auth = await verifyApiKey(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })
  return null
}

async function storeOf(raw: string | null | undefined) {
  const id = (raw ?? "").replace(/^locations\//, "")
  if (!/^\d{1,30}$/.test(id)) return null
  const [s] = await db
    .select({ locationName: stores.locationName })
    .from(stores)
    .where(eq(stores.locationName, `locations/${id}`))
  return s?.locationName ?? null
}

export async function POST(request: Request) {
  const ng = await guard(request, "ext-links")
  if (ng) return ng
  let body: { locationId?: string; label?: string; targetUrl?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const locationName = await storeOf(body.locationId)
  if (!locationName) return NextResponse.json({ error: "店舗が登録されていません" }, { status: 404 })
  const label = (body.label ?? "").trim()
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(label)) {
    return NextResponse.json({ error: "label は英数字・-・_ で指定してください" }, { status: 400 })
  }
  let target: URL
  try {
    target = new URL(body.targetUrl ?? "")
  } catch {
    return NextResponse.json({ error: "転送先URLが正しくありません" }, { status: 400 })
  }
  if (target.protocol !== "https:") {
    return NextResponse.json({ error: "転送先は https のURLにしてください" }, { status: 400 })
  }
  try {
    const [found] = await db
      .select({ token: trackedLinks.token })
      .from(trackedLinks)
      .where(
        and(
          eq(trackedLinks.locationName, locationName),
          eq(trackedLinks.label, label),
          eq(trackedLinks.targetUrl, target.toString())
        )
      )
    const token = found?.token ?? randomBytes(18).toString("base64url")
    if (!found) {
      await db.insert(trackedLinks).values({ token, locationName, label, targetUrl: target.toString() })
    }
    return NextResponse.json({ token, url: publicUrl(request, token) })
  } catch (e) {
    return errorResponse("Failed to create link", e)
  }
}

export async function GET(request: Request) {
  const ng = await guard(request, "ext-links-list")
  if (ng) return ng
  const locationName = await storeOf(new URL(request.url).searchParams.get("locationId"))
  if (!locationName) return NextResponse.json({ error: "店舗が登録されていません" }, { status: 404 })
  try {
    const links = await db.select().from(trackedLinks).where(eq(trackedLinks.locationName, locationName))
    const clicks = links.length
      ? await db.select().from(trackedLinkClicks).where(inArray(trackedLinkClicks.linkId, links.map((l) => l.id)))
      : []
    return NextResponse.json({
      links: links.map((l) => {
        const daily = Object.fromEntries(clicks.filter((c) => c.linkId === l.id).map((c) => [c.day, c.clicks]))
        return {
          label: l.label,
          url: publicUrl(request, l.token),
          targetUrl: l.targetUrl,
          createdAt: l.createdAt,
          total: Object.values(daily).reduce((a, b) => a + b, 0),
          daily,
        }
      }),
    })
  } catch (e) {
    return errorResponse("Failed to list links", e)
  }
}
