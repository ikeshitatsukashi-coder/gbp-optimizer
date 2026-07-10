import { NextResponse } from "next/server"
import { verifyApiKey } from "@/lib/services/api-key-auth"
import { computeQuickDiagnosis } from "@/lib/services/quick-diagnosis"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

/**
 * GET /api/ext/diagnosis
 * 全店舗のクイック診断（APIキー認証・読み取り専用）
 */
export async function GET(request: Request) {
  const rl = checkRateLimit(`ext-diag:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 30,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const auth = await verifyApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const result = await computeQuickDiagnosis()
    return NextResponse.json(result)
  } catch (e) {
    return errorResponse("Failed to run diagnosis", e)
  }
}
