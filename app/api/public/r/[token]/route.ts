import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { trackedLinks, trackedLinkClicks } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

/** 検索エンジンやリンクのプレビュー取得は数えない */
const BOT = /bot|crawl|spider|preview|facebookexternalhit|slurp|bingpreview|headless|curl|wget|python|node-fetch|axios/i

/**
 * GET /api/public/r/{token}
 * 計測リンク（認証なし・トークンが鍵）。クリックを日本時間の日付ごとに数えて、登録された転送先へ送る。
 * 数えるのに失敗しても、転送は必ず行う（応募しようとした人を止めない）。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!token || !/^[A-Za-z0-9_-]{16,40}$/.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const [link] = await db
    .select({ id: trackedLinks.id, targetUrl: trackedLinks.targetUrl })
    .from(trackedLinks)
    .where(eq(trackedLinks.token, token))
  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const ua = request.headers.get("user-agent") ?? ""
  // 同じ人の連打は1分に3回まで数える
  const rl = checkRateLimit(`pub-r:${token}:${getClientId(request)}`, { windowMs: 60_000, max: 3 })
  if (ua && !BOT.test(ua) && rl.allowed) {
    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
    try {
      await db
        .insert(trackedLinkClicks)
        .values({ linkId: link.id, day, clicks: 1 })
        .onConflictDoUpdate({
          target: [trackedLinkClicks.linkId, trackedLinkClicks.day],
          set: { clicks: sql`${trackedLinkClicks.clicks} + 1` },
        })
    } catch {
      // 数えられなくても転送は続ける
    }
  }
  return NextResponse.redirect(link.targetUrl, 302)
}
