import { createHash, randomBytes } from "crypto"
import { db } from "@/lib/db"
import { apiKeys } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

/** キー生成: gbp_live_<32 hex> */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `gbp_live_${randomBytes(16).toString("hex")}`
  return {
    key,
    hash: createHash("sha256").update(key).digest("hex"),
    prefix: key.slice(0, 14), // "gbp_live_xxxxx"
  }
}

export interface ApiKeyAuthResult {
  ok: boolean
  keyId?: number
  keyName?: string
  error?: string
}

/**
 * Authorization: Bearer gbp_live_... を検証。
 * 成功時は lastUsedAt を更新して keyId を返す。
 */
export async function verifyApiKey(request: Request): Promise<ApiKeyAuthResult> {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) {
    return { ok: false, error: "Authorization: Bearer <api key> ヘッダーが必要です" }
  }
  const key = auth.slice(7).trim()
  if (!key.startsWith("gbp_live_")) {
    return { ok: false, error: "APIキーの形式が不正です" }
  }

  const hash = createHash("sha256").update(key).digest("hex")
  const [row] = await db
    .select({ id: apiKeys.id, name: apiKeys.name })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.revoked, false)))

  if (!row) {
    return { ok: false, error: "APIキーが無効か失効しています" }
  }

  // 最終利用時刻を更新（失敗しても認証自体は成功扱い）
  try {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id))
  } catch {
    // noop
  }

  return { ok: true, keyId: row.id, keyName: row.name }
}
