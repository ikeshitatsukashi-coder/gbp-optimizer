import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { monthlyReports } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

/**
 * GET /api/public/monthly/{token}
 * 月次レポートのお客様用ページのデータ（ログイン不要・URLが鍵・読み取りのみ）。
 * 中身は発行した時点で保存した数字。ここから Google には問い合わせない。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = checkRateLimit(`pub-monthly:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 30,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }
  const { token } = await params
  if (!token || !/^[a-f0-9]{40}$/.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const [row] = await db
    .select({ snapshot: monthlyReports.snapshot, revoked: monthlyReports.revoked })
    .from(monthlyReports)
    .where(eq(monthlyReports.token, token))
  if (!row || row.revoked) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json({ report: row.snapshot })
}
