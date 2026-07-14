import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { surveys, stores, surveyResponses } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { googleReviewUrl, locationNameOf } from "@/lib/public-link"

/**
 * POST /api/public/surveys/{token}/responses
 * アンケート回答の受付（認証なし）。
 * 回答内容から遷移先を判定して返す:
 *   - 選択された選択肢がすべて「google」設定 → Googleレビュー投稿URLへ誘導
 *   - 1つでも「tool」設定 → ツール内レビュー（社内のみ閲覧）へ誘導
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = checkRateLimit(`pub-survey-post:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 20,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const { token } = await params
  const [survey] = await db.select().from(surveys).where(eq(surveys.token, token))
  if (!survey || survey.status !== "active") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let body: {
    store?: string
    answers?: { title: string; selected: string[] }[]
    respondentName?: string
    respondentContact?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.store) {
    return NextResponse.json({ error: "店舗を選択してください" }, { status: 400 })
  }
  const locationName = locationNameOf(body.store)

  // 対象店舗チェック
  if (survey.targetStores && survey.targetStores.length > 0) {
    if (!survey.targetStores.includes(locationName)) {
      return NextResponse.json({ error: "対象外の店舗です" }, { status: 400 })
    }
  }
  const [store] = await db
    .select({
      locationName: stores.locationName,
      title: stores.title,
      placeId: stores.placeId,
      newReviewUri: stores.newReviewUri,
    })
    .from(stores)
    .where(eq(stores.locationName, locationName))
  if (!store) {
    return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 })
  }

  // 回答バリデーション: 定義済みの質問・選択肢ラベルに限定
  const questions = survey.questions ?? []
  const answers: { title: string; selected: string[] }[] = []
  for (const q of questions) {
    const submitted = (body.answers ?? []).find((a) => a?.title === q.title)
    const validLabels = new Set(q.choices.map((c) => c.label))
    const selected = (submitted?.selected ?? []).filter((s) => validLabels.has(s))
    if (q.type === "single" && selected.length !== 1) {
      return NextResponse.json(
        { error: `「${q.title}」に回答してください` },
        { status: 400 }
      )
    }
    answers.push({ title: q.title, selected })
  }

  // 遷移先判定: 1つでも tool 設定の選択肢が選ばれていたら tool
  let redirect: "google" | "tool" = "google"
  for (const q of questions) {
    const ans = answers.find((a) => a.title === q.title)
    if (!ans) continue
    for (const sel of ans.selected) {
      const choice = q.choices.find((c) => c.label === sel)
      if (choice?.redirect === "tool") redirect = "tool"
    }
  }

  try {
    const [created] = await db
      .insert(surveyResponses)
      .values({
        surveyId: survey.id,
        locationName,
        answers,
        respondentName: survey.collectRespondent
          ? body.respondentName?.trim()?.slice(0, 100) || null
          : null,
        respondentContact: survey.collectRespondent
          ? body.respondentContact?.trim()?.slice(0, 200) || null
          : null,
        redirectedTo: redirect,
      })
      .returning({ id: surveyResponses.id })

    return NextResponse.json({
      success: true,
      responseId: created.id,
      redirect,
      ...(redirect === "google" ? { googleReviewUrl: googleReviewUrl(store) } : {}),
    })
  } catch (e) {
    console.error("Failed to save survey response:", e)
    return NextResponse.json({ error: "回答の保存に失敗しました" }, { status: 500 })
  }
}
