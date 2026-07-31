import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { socialConnections } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { encryptToken, hasEncryptionKey } from "@/lib/crypto"

/**
 * 店舗ごとの外部サービス連携（SNS等）
 *
 * GET    一覧（トークンは返さない）
 * POST   登録・更新（provider + externalId で upsert 相当）
 * DELETE ?id= で解除
 *
 * ※Instagram / Facebook は Meta の App Review 承認後に実データ連携が有効になる。
 *   承認前でも「申請中」として登録・管理できるようにしている。
 */

const VALID_PROVIDERS = new Set(["instagram", "facebook", "line", "x", "ga4"])

function buildLocationName(locationId: string): string {
  return locationId.startsWith("locations/") ? locationId : `locations/${locationId}`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { locationId } = await params
  try {
    const rows = await db
      .select({
        id: socialConnections.id,
        provider: socialConnections.provider,
        accountName: socialConnections.accountName,
        externalId: socialConnections.externalId,
        status: socialConnections.status,
        settings: socialConnections.settings,
        lastSyncedAt: socialConnections.lastSyncedAt,
        errorMessage: socialConnections.errorMessage,
        createdAt: socialConnections.createdAt,
        tokenExpiresAt: socialConnections.tokenExpiresAt,
        // 値そのものは返さず、登録済みかどうかだけ画面に伝える
        hasToken: sql<boolean>`${socialConnections.accessToken} is not null`,
      })
      .from(socialConnections)
      .where(eq(socialConnections.locationName, buildLocationName(locationId)))
    // accessToken は意図的に返さない
    return NextResponse.json({ connections: rows })
  } catch (e) {
    return errorResponse("Failed to list connections", e)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { locationId } = await params
  const locationName = buildLocationName(locationId)

  let body: {
    id?: number
    provider?: string
    accountName?: string
    externalId?: string
    accessToken?: string
    status?: string
    settings?: Record<string, unknown>
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.provider || !VALID_PROVIDERS.has(body.provider)) {
    return NextResponse.json(
      { error: `provider は ${[...VALID_PROVIDERS].join(" / ")} のいずれかです` },
      { status: 400 }
    )
  }

  // トークンを預かる場合は暗号化鍵が無いと保存させない（平文で残らないようにする）
  if (body.accessToken && !hasEncryptionKey()) {
    return NextResponse.json(
      {
        error:
          "トークンを保存するための暗号化鍵（TOKEN_ENCRYPTION_KEY）が設定されていません。管理者に連絡してください。",
      },
      { status: 500 }
    )
  }

  try {
    const email = await getSessionEmail()

    // 既存レコードの更新（id 指定 or provider+externalId 一致）
    let existingId = body.id ?? null
    if (!existingId && body.externalId) {
      const [hit] = await db
        .select({ id: socialConnections.id })
        .from(socialConnections)
        .where(
          and(
            eq(socialConnections.locationName, locationName),
            eq(socialConnections.provider, body.provider),
            eq(socialConnections.externalId, body.externalId)
          )
        )
      existingId = hit?.id ?? null
    }

    if (existingId) {
      await db
        .update(socialConnections)
        .set({
          ...(body.accountName !== undefined ? { accountName: body.accountName } : {}),
          ...(body.externalId !== undefined ? { externalId: body.externalId } : {}),
          ...(body.accessToken ? { accessToken: encryptToken(body.accessToken) } : {}),
          ...(body.status ? { status: body.status } : {}),
          ...(body.settings !== undefined ? { settings: body.settings } : {}),
          updatedAt: new Date(),
        })
        .where(eq(socialConnections.id, existingId))
      return NextResponse.json({ success: true, id: existingId })
    }

    const [created] = await db
      .insert(socialConnections)
      .values({
        locationName,
        provider: body.provider,
        accountName: body.accountName ?? null,
        externalId: body.externalId ?? null,
        accessToken: body.accessToken ? encryptToken(body.accessToken) : null,
        status: body.status ?? "pending",
        settings: body.settings ?? {},
        createdBy: email,
      })
      .returning({ id: socialConnections.id })
    return NextResponse.json({ success: true, id: created.id })
  } catch (e) {
    return errorResponse("Failed to save connection", e)
  }
}

export async function DELETE(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  const id = parseInt(new URL(request.url).searchParams.get("id") ?? "", 10)
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 })
  try {
    await db.delete(socialConnections).where(eq(socialConnections.id, id))
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to delete connection", e)
  }
}
