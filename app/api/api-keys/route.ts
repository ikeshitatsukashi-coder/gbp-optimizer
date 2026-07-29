import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { apiKeys } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { generateApiKey } from "@/lib/services/api-key-auth"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"

/** 管理画面用（セッション認証）。キー本体は作成時に一度だけ返す。 */

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        createdBy: apiKeys.createdBy,
        lastUsedAt: apiKeys.lastUsedAt,
        revoked: apiKeys.revoked,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt))
      .limit(100)
    return NextResponse.json({ keys })
  } catch (e) {
    return errorResponse("Failed to list api keys", e)
  }
}

export async function POST(request: Request) {
  const denied = await requireRole("admin")
  if (denied) return denied

  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: { name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }

  try {
    const { key, hash, prefix } = generateApiKey()
    const [created] = await db
      .insert(apiKeys)
      .values({
        name,
        keyHash: hash,
        prefix,
        createdBy: session.user?.email ?? null,
      })
      .returning({ id: apiKeys.id })

    // key はこのレスポンスでしか取得できない
    return NextResponse.json({ id: created.id, name, prefix, key })
  } catch (e) {
    return errorResponse("Failed to create api key", e)
  }
}

export async function DELETE(request: Request) {
  const denied = await requireRole("admin")
  if (denied) return denied

  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  try {
    const result = await db
      .update(apiKeys)
      .set({ revoked: true })
      .where(eq(apiKeys.id, parseInt(id, 10)))
      .returning({ id: apiKeys.id })
    if (result.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to revoke api key", e)
  }
}
