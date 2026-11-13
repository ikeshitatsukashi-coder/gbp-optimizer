import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reviewNotices } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { isMailConfigured, sendReviewRequestMail } from "@/lib/services/mailer"
import { aiReady, original } from "@/lib/services/reply-drafts"
import {
  LOOKBACK_DAYS,
  checkLowReviews,
  getLastCheck,
  getNotifyEmail,
  setNotifyEmail,
} from "@/lib/services/review-notices"

export const maxDuration = 60

/**
 * 低評価クチコミのお知らせ（社内・ログイン必須）
 *
 *   GET  ?status=open|all        控えてある低評価の一覧（返信案つき）
 *   POST { action: "check" }     いま Google を確認して、新着の低評価を控える（読み取りのみ）
 *   POST { action: "check", auto: true }  画面を開いた時の自動確認（前回から3時間たっていなければ何もしない）
 *   POST { action: "notify", reviewName, to, subject, body }  お客様にメールで知らせる（担当が押した時だけ）
 *   PATCH { reviewName, status }  対応済みにする／未対応に戻す
 *   PATCH { notifyEmail }         新着があった時に社内へ知らせるメールの宛先（空にすると送らない）
 */

/** 自動確認の最短間隔 */
const AUTO_INTERVAL_MS = 3 * 3600e3

function rowsOf(r: unknown): Record<string, unknown>[] {
  return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[]
}
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null)

export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const showAll = new URL(request.url).searchParams.get("status") === "all"
  try {
    const rows = rowsOf(
      await db.execute(sql`
        select n.review_name, n.location_name, s.title, s.notify_email,
               n.reviewer, n.star_rating, n.comment, n.review_create_time, n.detected_at,
               n.status, n.notified_at, n.notified_to, n.handled_at,
               d.draft, d.source as draft_source, d.status as draft_status
        from review_notices n
        join stores s on s.location_name = n.location_name
        left join review_reply_drafts d on d.review_name = n.review_name
        ${showAll ? sql`` : sql`where n.status <> 'done'`}
        order by n.review_create_time desc nulls last
        limit 300
      `)
    )
    const [lastCheck, notifyEmail] = await Promise.all([getLastCheck(), getNotifyEmail()])
    return NextResponse.json({
      lookbackDays: LOOKBACK_DAYS,
      lastCheck,
      notifyEmail,
      mailReady: isMailConfigured(),
      aiReady: aiReady(),
      notices: rows.map((r) => ({
        reviewName: String(r.review_name),
        locationName: String(r.location_name),
        storeTitle: String(r.title),
        storeEmail: r.notify_email ? String(r.notify_email) : null,
        reviewer: r.reviewer ? String(r.reviewer) : null,
        starRating: Number(r.star_rating ?? 0),
        comment: original(r.comment ? String(r.comment) : null) || null,
        reviewCreateTime: iso(r.review_create_time),
        detectedAt: iso(r.detected_at),
        status: String(r.status),
        notifiedAt: iso(r.notified_at),
        notifiedTo: r.notified_to ? String(r.notified_to) : null,
        draft: r.draft ? String(r.draft) : "",
        draftSource: r.draft_source ? String(r.draft_source) : null,
        /** posted = この画面（または返信の下書き画面）から返信を投稿済み */
        draftStatus: r.draft_status ? String(r.draft_status) : null,
      })),
    })
  } catch (e) {
    return errorResponse("お知らせを読み込めませんでした", e)
  }
}

export async function POST(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  let body: {
    action?: string
    auto?: boolean
    reviewName?: string
    to?: string
    subject?: string
    body?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    if (body.action === "check") {
      if (body.auto) {
        const last = await getLastCheck()
        if (last && Date.now() - new Date(last.at).getTime() < AUTO_INTERVAL_MS) {
          return NextResponse.json({ skipped: true, lastCheck: last })
        }
      } else {
        const rl = checkRateLimit(`low-review-check:${getClientId(request)}`, {
          windowMs: 60_000,
          max: 3,
        })
        if (!rl.allowed) {
          return NextResponse.json(
            { error: "少し時間をおいてから、もう一度お試しください。" },
            { status: 429 }
          )
        }
      }
      const email = (await getSessionEmail()) ?? "unknown"
      const result = await checkLowReviews(body.auto ? "自動確認" : email)
      return NextResponse.json({ success: true, result })
    }

    if (body.action === "notify") {
      const denied = await requireRole("editor")
      if (denied) return denied
      const to = (body.to ?? "").trim()
      const subject = (body.subject ?? "").trim()
      const text = (body.body ?? "").trim()
      if (!body.reviewName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !text) {
        return NextResponse.json(
          { error: "宛先のメールアドレス・件名・本文を入力してください" },
          { status: 400 }
        )
      }
      if (!isMailConfigured()) {
        return NextResponse.json(
          { error: "メール送信の設定がありません。連絡文をコピーしてお使いください。" },
          { status: 503 }
        )
      }
      const sent = await sendReviewRequestMail({ to, subject, text })
      if (!sent.ok) {
        return NextResponse.json(
          { error: `メールを送れませんでした：${sent.error ?? ""}` },
          { status: 502 }
        )
      }
      const email = await getSessionEmail()
      await db
        .update(reviewNotices)
        .set({ status: "notified", notifiedAt: new Date(), notifiedBy: email, notifiedTo: to })
        .where(eq(reviewNotices.reviewName, body.reviewName))
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "操作が指定されていません" }, { status: 400 })
  } catch (e) {
    return errorResponse("処理できませんでした", e)
  }
}

export async function PATCH(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  let body: { reviewName?: string; status?: string; notifyEmail?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  try {
    const email = await getSessionEmail()
    if (typeof body.notifyEmail === "string") {
      const v = body.notifyEmail.trim()
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return NextResponse.json({ error: "メールアドレスの形が正しくありません" }, { status: 400 })
      }
      await setNotifyEmail(v, email)
      return NextResponse.json({ success: true })
    }
    if (body.reviewName && (body.status === "done" || body.status === "new")) {
      await db
        .update(reviewNotices)
        .set(
          body.status === "done"
            ? { status: "done", handledAt: new Date(), handledBy: email }
            : { status: "new", handledAt: null, handledBy: null }
        )
        .where(eq(reviewNotices.reviewName, body.reviewName))
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: "変更内容がありません" }, { status: 400 })
  } catch (e) {
    return errorResponse("変更できませんでした", e)
  }
}
