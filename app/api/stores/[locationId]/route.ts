import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { stores, type Store } from "@/lib/db/schema"
import { getAccessToken } from "@/lib/get-session"
import { eq } from "drizzle-orm"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { errorResponse } from "@/lib/api-helpers"

const VALID_STATUS = new Set(["active", "paused", "archived"])
const VALID_INDUSTRY = new Set([
  "btob_logistics",
  "bakery",
  "funeral",
  "restaurant",
  "construction",
  "staffing",
  "buyback",
  "general_btoc",
  "general_btob",
])

/**
 * locations/<id> 形式の Google resource name を組み立てる。
 * URL パラメータには ID 部分のみが渡される（/ を含めないため）。
 */
function buildLocationName(locationId: string): string {
  return locationId.startsWith("locations/") ? locationId : `locations/${locationId}`
}

/**
 * GET /api/stores/[locationId]
 * 1店舗の詳細を返す
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { locationId } = await params
  const locationName = buildLocationName(locationId)

  try {
    const [store] = await db.select().from(stores).where(eq(stores.locationName, locationName))
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }
    return NextResponse.json({ store })
  } catch (e) {
    return errorResponse("Failed to fetch store", e)
  }
}

/**
 * PATCH /api/stores/[locationId]
 *
 * 社内設定の更新（業種・運用ステータス・自動返信フラグ・除外グループ・メモ）
 * Google API 由来のフィールド（title/address/phone）は同期のみで更新されるため受け付けない
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const rl = checkRateLimit(`stores-update:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 120,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } }
    )
  }

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { locationId } = await params
  const locationName = buildLocationName(locationId)

  try {
    const body = await request.json()
    const patch: Partial<Store> = {}

    if (typeof body.status === "string") {
      if (!VALID_STATUS.has(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 })
      }
      patch.status = body.status as Store["status"]
    }
    if (typeof body.industry === "string") {
      if (!VALID_INDUSTRY.has(body.industry)) {
        return NextResponse.json({ error: "Invalid industry" }, { status: 400 })
      }
      patch.industry = body.industry as Store["industry"]
    }
    if (typeof body.autoReplyEnabled === "boolean") {
      patch.autoReplyEnabled = body.autoReplyEnabled
    }
    if (typeof body.autoFlagEnabled === "boolean") {
      patch.autoFlagEnabled = body.autoFlagEnabled
    }
    if (typeof body.parentCompany === "string" || body.parentCompany === null) {
      patch.parentCompany = body.parentCompany
    }
    if (typeof body.notes === "string" || body.notes === null) {
      patch.notes = body.notes
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    patch.updatedAt = new Date()

    const [updated] = await db
      .update(stores)
      .set(patch)
      .where(eq(stores.locationName, locationName))
      .returning()

    if (!updated) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 })
    }

    return NextResponse.json({ store: updated })
  } catch (e) {
    return errorResponse("Failed to update store", e)
  }
}
