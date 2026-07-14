import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { surveys, stores } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { locationIdOf } from "@/lib/public-link"

/**
 * GET /api/public/surveys/{token}
 * 公開アンケートの定義取得（認証なし・トークンが鍵）。
 * ※選択肢ごとの遷移先設定（google/tool）は回答者に見せない。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = checkRateLimit(`pub-survey:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 60,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const { token } = await params
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const [survey] = await db.select().from(surveys).where(eq(surveys.token, token))
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (survey.status !== "active") {
    return NextResponse.json({ error: "closed", message: "このアンケートは終了しました" }, { status: 410 })
  }

  // 対象店舗リスト（選択肢用）
  const target = survey.targetStores
  const storeRows = await db
    .select({ locationName: stores.locationName, title: stores.title })
    .from(stores)
    .where(
      target && target.length > 0
        ? and(eq(stores.status, "active"), inArray(stores.locationName, target))
        : eq(stores.status, "active")
    )
    .orderBy(stores.title)

  return NextResponse.json({
    name: survey.name,
    description: survey.description,
    urlMode: survey.urlMode,
    storeSelectMode: survey.storeSelectMode,
    collectRespondent: survey.collectRespondent,
    // redirect 設定は隠して選択肢ラベルだけ返す
    questions: (survey.questions ?? []).map((q) => ({
      title: q.title,
      type: q.type,
      choices: q.choices.map((c) => c.label),
    })),
    stores: storeRows.map((s) => ({ id: locationIdOf(s.locationName), title: s.title })),
  })
}
