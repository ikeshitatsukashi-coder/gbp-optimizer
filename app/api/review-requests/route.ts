import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reviewRequests, stores, surveys } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { googleReviewUrl, locationIdOf } from "@/lib/public-link"
import { isMailConfigured, sendReviewRequestMail, type SendResult } from "@/lib/services/mailer"

/** メール送信に時間がかかるため延長（最大50件/回） */
export const maxDuration = 60

const MAX_RECIPIENTS = 50

/**
 * クチコミ依頼メール
 * - POST: 指定店舗のお客様リストへアンケート/クチコミURL付きメールを送信
 * - GET:  送信履歴一覧
 *
 * ★スコープ注: 送信は担当者が画面の「送信」ボタンで都度実行する（自動送信はしない）
 */

export async function GET() {
  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  try {
    const rows = await db
      .select({
        id: reviewRequests.id,
        locationName: reviewRequests.locationName,
        storeTitle: stores.title,
        urlType: reviewRequests.urlType,
        surveyId: reviewRequests.surveyId,
        subject: reviewRequests.subject,
        sentCount: reviewRequests.sentCount,
        failCount: reviewRequests.failCount,
        status: reviewRequests.status,
        results: reviewRequests.results,
        createdAt: reviewRequests.createdAt,
      })
      .from(reviewRequests)
      .innerJoin(stores, eq(stores.locationName, reviewRequests.locationName))
      .orderBy(desc(reviewRequests.createdAt))
      .limit(100)
    return NextResponse.json({ requests: rows, mailConfigured: isMailConfigured() })
  } catch (e) {
    return errorResponse("Failed to list review requests", e)
  }
}

interface Recipient {
  name: string
  email: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  let body: {
    locationName?: string
    urlType?: string
    surveyId?: number
    subject?: string
    body?: string
    recipients?: Recipient[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // バリデーション
  if (!body.locationName) {
    return NextResponse.json({ error: "店舗を選択してください" }, { status: 400 })
  }
  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: "件名と本文は必須です" }, { status: 400 })
  }
  const recipients = (body.recipients ?? [])
    .map((r) => ({ name: (r.name ?? "").trim(), email: (r.email ?? "").trim() }))
    .filter((r) => r.email)
  if (recipients.length === 0) {
    return NextResponse.json({ error: "宛先を1件以上入力してください" }, { status: 400 })
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `一度に送信できるのは ${MAX_RECIPIENTS} 件までです（${recipients.length}件指定）` },
      { status: 400 }
    )
  }
  const invalid = recipients.filter((r) => !EMAIL_RE.test(r.email))
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `メールアドレスの形式が不正です: ${invalid.map((r) => r.email).join(", ")}` },
      { status: 400 }
    )
  }

  const [store] = await db
    .select()
    .from(stores)
    .where(eq(stores.locationName, body.locationName))
  if (!store) {
    return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 })
  }

  // クチコミURL解決
  const urlType = body.urlType === "google" ? "google" : body.urlType === "none" ? "none" : "survey"
  let kutikomiUrl = ""
  let surveyId: number | null = null
  if (urlType === "survey") {
    if (!body.surveyId) {
      return NextResponse.json({ error: "対象アンケートを選択してください" }, { status: 400 })
    }
    const [survey] = await db.select().from(surveys).where(eq(surveys.id, body.surveyId))
    if (!survey || survey.status !== "active") {
      return NextResponse.json({ error: "対象アンケートが見つからないか停止中です" }, { status: 400 })
    }
    surveyId = survey.id
    const origin = new URL(request.url).origin
    kutikomiUrl = `${origin}/s/${survey.token}?store=${locationIdOf(store.locationName)}`
  } else if (urlType === "google") {
    kutikomiUrl = googleReviewUrl(store)
  }

  // 本文にURLプレースホルダがなければ末尾に自動付与
  let template = body.body
  if (urlType !== "none" && !template.includes("%KutikomiURL%")) {
    template = `${template.trimEnd()}\n\n%KutikomiURL%`
  }

  // 1件ずつ送信（プレースホルダ差し込み）
  const results: SendResult[] = []
  for (const r of recipients) {
    const text = template
      .replaceAll("%ClientName%", r.name || "お客")
      .replaceAll("%StoreName%", store.title)
      .replaceAll("%KutikomiURL%", kutikomiUrl)
    const subject = body.subject
      .replaceAll("%ClientName%", r.name || "お客")
      .replaceAll("%StoreName%", store.title)
    results.push(await sendReviewRequestMail({ to: r.email, toName: r.name, subject, text }))
  }

  const sentCount = results.filter((r) => r.ok).length
  const failCount = results.length - sentCount

  try {
    const email = await getSessionEmail()
    const [created] = await db
      .insert(reviewRequests)
      .values({
        locationName: store.locationName,
        urlType,
        surveyId,
        subject: body.subject,
        body: body.body,
        recipients,
        sentCount,
        failCount,
        status: failCount === 0 ? "done" : sentCount === 0 ? "failed" : "partial",
        results,
        createdBy: email,
      })
      .returning({ id: reviewRequests.id })

    return NextResponse.json({
      success: true,
      id: created.id,
      sentCount,
      failCount,
      results,
    })
  } catch (e) {
    return errorResponse("送信結果の保存に失敗しました", e)
  }
}
