import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { surveys } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/surveys/results?surveyId=1&days=30&locationName=locations/xxx
 * アンケート回答の集計（質問×選択肢の件数）＋ ツール内ユーザーレビュー一覧
 */
export async function GET(request: Request) {
  const token = await getAccessToken()
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const surveyId = parseInt(url.searchParams.get("surveyId") ?? "", 10)
  const days = Math.min(parseInt(url.searchParams.get("days") ?? "30", 10) || 30, 1095)
  const locationName = url.searchParams.get("locationName")

  if (!surveyId) {
    return NextResponse.json({ error: "surveyId が必要です" }, { status: 400 })
  }

  try {
    const [survey] = await db.select().from(surveys).where(eq(surveys.id, surveyId))
    if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const since = new Date(Date.now() - days * 86400000)

    const respRows = await db.execute(sql`
      SELECT r.answers, r.location_name, r.redirected_to, r.created_at,
             r.respondent_name, r.respondent_contact
      FROM survey_responses r
      WHERE r.survey_id = ${surveyId}
        AND r.created_at >= ${since.toISOString()}
        ${locationName ? sql`AND r.location_name = ${locationName}` : sql``}
      ORDER BY r.created_at DESC
      LIMIT 5000
    `)
    const responses = (
      Array.isArray(respRows) ? respRows : ((respRows as { rows?: unknown[] }).rows ?? [])
    ) as Array<{
      answers: { title: string; selected: string[] }[]
      location_name: string
      redirected_to: string | null
      created_at: string
      respondent_name: string | null
      respondent_contact: string | null
    }>

    // 質問×選択肢ごとの件数を集計
    const questionStats = (survey.questions ?? []).map((q) => {
      const counts = q.choices.map((c) => ({ label: c.label, count: 0 }))
      for (const r of responses) {
        const ans = (r.answers ?? []).find((a) => a.title === q.title)
        if (!ans) continue
        for (const selected of ans.selected) {
          const hit = counts.find((c) => c.label === selected)
          if (hit) hit.count += 1
        }
      }
      return { title: q.title, type: q.type, counts }
    })

    // ツール内ユーザーレビュー（Googleレビュー以外の評価）
    const reviewRows = await db.execute(sql`
      SELECT v.id, v.rating, v.comment, v.created_at, v.location_name, s.title AS store_title
      FROM survey_reviews v
      INNER JOIN stores s ON s.location_name = v.location_name
      WHERE v.survey_id = ${surveyId}
        AND v.created_at >= ${since.toISOString()}
        ${locationName ? sql`AND v.location_name = ${locationName}` : sql``}
      ORDER BY v.created_at DESC
      LIMIT 500
    `)
    const userReviews = (
      Array.isArray(reviewRows)
        ? reviewRows
        : ((reviewRows as { rows?: unknown[] }).rows ?? [])
    ) as Array<Record<string, unknown>>

    // 回答者情報（collectRespondent 有効時のみ意味を持つ）
    const respondents = responses
      .filter((r) => r.respondent_name || r.respondent_contact)
      .slice(0, 200)
      .map((r) => ({
        name: r.respondent_name,
        contact: r.respondent_contact,
        locationName: r.location_name,
        createdAt: r.created_at,
      }))

    return NextResponse.json({
      survey: { id: survey.id, name: survey.name, questions: survey.questions },
      responseCount: responses.length,
      questionStats,
      userReviews: userReviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
        storeTitle: r.store_title,
      })),
      respondents,
      periodDays: days,
    })
  } catch (e) {
    return errorResponse("Failed to aggregate results", e)
  }
}
