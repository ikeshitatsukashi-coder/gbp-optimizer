import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { surveys, surveyResponses, type SurveyQuestion } from "@/lib/db/schema"
import { eq, sql, desc } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { generatePublicToken } from "@/lib/public-link"
import { requireRole } from "@/lib/services/authz"

/**
 * アンケート定義の CRUD（社内・セッション認証）
 * 回答が1件でも付いたアンケートは内容編集不可（GMOツールと同仕様）。複製で対応。
 */

async function requireAuth() {
  const token = await getAccessToken()
  return !!token
}

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  try {
    const rows = await db
      .select({
        id: surveys.id,
        token: surveys.token,
        name: surveys.name,
        description: surveys.description,
        urlMode: surveys.urlMode,
        storeSelectMode: surveys.storeSelectMode,
        targetStores: surveys.targetStores,
        questions: surveys.questions,
        collectRespondent: surveys.collectRespondent,
        status: surveys.status,
        updatedAt: surveys.updatedAt,
        responseCount: sql<number>`(
          SELECT count(*)::int FROM survey_responses r WHERE r.survey_id = ${surveys.id}
        )`,
      })
      .from(surveys)
      .orderBy(desc(surveys.updatedAt))
    return NextResponse.json({ surveys: rows })
  } catch (e) {
    return errorResponse("Failed to list surveys", e)
  }
}

function validateQuestions(questions: unknown): questions is SurveyQuestion[] {
  if (!Array.isArray(questions) || questions.length === 0) return false
  return questions.every(
    (q) =>
      q &&
      typeof q.title === "string" &&
      q.title.trim().length > 0 &&
      (q.type === "single" || q.type === "multiple") &&
      Array.isArray(q.choices) &&
      q.choices.length >= 2 &&
      q.choices.every(
        (c: { label?: unknown; redirect?: unknown }) =>
          typeof c.label === "string" &&
          (c.label as string).trim().length > 0 &&
          (c.redirect === "google" || c.redirect === "tool")
      )
  )
}

export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  let body: {
    name?: string
    description?: string
    urlMode?: string
    storeSelectMode?: string
    targetStores?: string[] | null
    questions?: SurveyQuestion[]
    collectRespondent?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "アンケート名は必須です" }, { status: 400 })
  }
  if (!validateQuestions(body.questions)) {
    return NextResponse.json(
      { error: "質問は1問以上、各質問に選択肢2つ以上が必要です" },
      { status: 400 }
    )
  }

  try {
    const email = await getSessionEmail()
    const [created] = await db
      .insert(surveys)
      .values({
        token: generatePublicToken(),
        name: body.name.trim(),
        description: body.description?.trim() || null,
        urlMode: body.urlMode === "per_store" ? "per_store" : "group",
        storeSelectMode: body.storeSelectMode === "buttons" ? "buttons" : "pulldown",
        targetStores:
          Array.isArray(body.targetStores) && body.targetStores.length > 0
            ? body.targetStores
            : null,
        questions: body.questions,
        collectRespondent: !!body.collectRespondent,
        createdBy: email,
      })
      .returning({ id: surveys.id, token: surveys.token })
    return NextResponse.json({ success: true, ...created })
  } catch (e) {
    return errorResponse("Failed to create survey", e)
  }
}

export async function PATCH(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const url = new URL(request.url)
  const id = parseInt(url.searchParams.get("id") ?? "", 10)
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 })

  let body: {
    name?: string
    description?: string
    urlMode?: string
    storeSelectMode?: string
    targetStores?: string[] | null
    questions?: SurveyQuestion[]
    collectRespondent?: boolean
    status?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(surveyResponses)
      .where(eq(surveyResponses.surveyId, id))
    const hasResponses = (countRow?.count ?? 0) > 0

    // ステータス変更（公開停止/再開）はいつでも可能
    if (body.status === "active" || body.status === "closed") {
      await db
        .update(surveys)
        .set({ status: body.status, updatedAt: new Date() })
        .where(eq(surveys.id, id))
    }

    // 対象店舗の変更は、回答があっても行える。
    // 配布先を増やすだけで既存の回答内容には影響せず、
    // これができないと後から店舗を追加したQRが「対象外の店舗です」で保存できなくなる。
    if (body.targetStores !== undefined) {
      await db
        .update(surveys)
        .set({
          targetStores:
            Array.isArray(body.targetStores) && body.targetStores.length > 0
              ? body.targetStores
              : null,
          updatedAt: new Date(),
        })
        .where(eq(surveys.id, id))
    }

    // 内容編集は回答ゼロの場合のみ
    if (body.questions || body.name || body.description !== undefined) {
      if (hasResponses) {
        return NextResponse.json(
          {
            error:
              "回答が既にあるため内容は編集できません。「複製」して新しいアンケートを作成してください。",
          },
          { status: 409 }
        )
      }
      if (body.questions && !validateQuestions(body.questions)) {
        return NextResponse.json(
          { error: "質問は1問以上、各質問に選択肢2つ以上が必要です" },
          { status: 400 }
        )
      }
      await db
        .update(surveys)
        .set({
          ...(body.name ? { name: body.name.trim() } : {}),
          ...(body.description !== undefined
            ? { description: body.description?.trim() || null }
            : {}),
          ...(body.urlMode
            ? { urlMode: body.urlMode === "per_store" ? "per_store" : "group" }
            : {}),
          ...(body.storeSelectMode
            ? {
                storeSelectMode:
                  body.storeSelectMode === "buttons" ? "buttons" : "pulldown",
              }
            : {}),
          ...(body.targetStores !== undefined
            ? {
                targetStores:
                  Array.isArray(body.targetStores) && body.targetStores.length > 0
                    ? body.targetStores
                    : null,
              }
            : {}),
          ...(body.questions ? { questions: body.questions } : {}),
          ...(body.collectRespondent !== undefined
            ? { collectRespondent: !!body.collectRespondent }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(surveys.id, id))
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to update survey", e)
  }
}

export async function DELETE(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const url = new URL(request.url)
  const id = parseInt(url.searchParams.get("id") ?? "", 10)
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 })
  try {
    await db.delete(surveys).where(eq(surveys.id, id))
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to delete survey", e)
  }
}
