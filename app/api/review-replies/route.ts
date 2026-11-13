import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import {
  aiReady,
  createDraft,
  original,
  postApprovedReply,
  saveDraft,
  setDraftStatus,
} from "@/lib/services/reply-drafts"

export const maxDuration = 60

/**
 * クチコミ返信の下書きと承認（社内・ログイン必須）
 *
 *   GET                                 未返信のクチコミがある店舗の一覧（件数つき）
 *   GET ?locationName=...&band=high|mid|low|all   その店舗の未返信クチコミ（下書きつき）
 *   POST { action: "draft", items: [...] }       下書きをまとめて作る（最大20件。Googleには出ない）
 *   POST { action: "save", reviewName, locationName, draft }   直した文面を保存
 *   POST { action: "post", reviewName, locationName, comment } 承認した1件を Google に投稿
 *   POST { action: "skip" | "unskip", reviewName, locationName } 見送る／戻す
 *
 * 投稿は必ず1件ずつ。投稿の直前に Google の今の状態を読み、すでに返信があれば上書きしない。
 * 一覧のもとは取り込み済みのクチコミ（reviews_archive）。ここからは読むだけで、
 * 返信を投稿できた時だけ、その1件を「返信済み」に更新する（既存の一括返信と同じ扱い）。
 */

function rowsOf(r: unknown): Record<string, unknown>[] {
  return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[]
}
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null)

function normalizeLocation(raw: string | null | undefined): string | null {
  const id = (raw ?? "").replace(/^locations\//, "")
  return /^\d{1,30}$/.test(id) ? `locations/${id}` : null
}

export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  const url = new URL(request.url)
  const rawLocation = url.searchParams.get("locationName")

  try {
    if (rawLocation) {
      const locationName = normalizeLocation(rawLocation)
      if (!locationName) {
        return NextResponse.json({ error: "店舗の指定が正しくありません" }, { status: 400 })
      }
      const band = url.searchParams.get("band") ?? "high"
      const bandSql =
        band === "high"
          ? sql`and r.star_rating >= 4`
          : band === "mid"
            ? sql`and r.star_rating = 3`
            : band === "low"
              ? sql`and r.star_rating <= 2`
              : sql``
      const rows = rowsOf(
        await db.execute(sql`
          select r.review_name, r.reviewer, r.star_rating, r.comment, r.create_time,
                 d.draft, d.source, d.status as draft_status
          from reviews_archive r
          left join review_reply_drafts d on d.review_name = r.review_name
          where r.location_name = ${locationName}
            and r.archive_reason = 'current'
            and (r.reply_comment is null or length(trim(r.reply_comment)) = 0)
            and r.star_rating is not null
            and coalesce(d.status, 'draft') <> 'posted'
            ${bandSql}
          order by r.create_time desc nulls last
          limit 100
        `)
      )
      return NextResponse.json({
        aiReady: aiReady(),
        reviews: rows.map((r) => ({
          reviewName: String(r.review_name),
          reviewer: r.reviewer ? String(r.reviewer) : null,
          starRating: Number(r.star_rating ?? 0),
          comment: original(r.comment ? String(r.comment) : null) || null,
          createTime: iso(r.create_time),
          draft: r.draft ? String(r.draft) : "",
          draftSource: r.source ? String(r.source) : null,
          skipped: r.draft_status === "skipped",
        })),
      })
    }

    const rows = rowsOf(
      await db.execute(sql`
        select s.location_name, s.title,
               exists (select 1 from scheduled_posts p where p.location_name = s.location_name)
                 as has_posts,
               count(*)::int as unreplied,
               count(*) filter (where r.star_rating >= 4)::int as high,
               count(*) filter (where r.star_rating = 3)::int as mid,
               count(*) filter (where r.star_rating <= 2)::int as low,
               max(r.create_time) as latest
        from reviews_archive r
        join stores s on s.location_name = r.location_name
        left join review_reply_drafts d on d.review_name = r.review_name
        where s.status = 'active'
          and (s.has_voice_of_merchant is null or s.has_voice_of_merchant = true)
          and s.duplicate_of is null
          and r.archive_reason = 'current'
          and (r.reply_comment is null or length(trim(r.reply_comment)) = 0)
          and r.star_rating is not null
          and coalesce(d.status, 'draft') = 'draft'
        group by s.location_name, s.title
        order by has_posts desc, unreplied desc, s.title
      `)
    )
    const latest = rowsOf(
      await db.execute(sql`select max(create_time) as t from reviews_archive`)
    )[0]
    return NextResponse.json({
      aiReady: aiReady(),
      /** 取り込み済みのクチコミのうち、いちばん新しい投稿日（取り込みがどこまで進んでいるかの目安） */
      archiveLatest: iso(latest?.t),
      stores: rows.map((r) => ({
        locationName: String(r.location_name),
        title: String(r.title),
        hasPosts: r.has_posts === true,
        unreplied: Number(r.unreplied ?? 0),
        high: Number(r.high ?? 0),
        mid: Number(r.mid ?? 0),
        low: Number(r.low ?? 0),
        latest: iso(r.latest),
      })),
    })
  } catch (e) {
    return errorResponse("クチコミを読み込めませんでした", e)
  }
}

export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  let body: {
    action?: string
    reviewName?: string
    locationName?: string
    draft?: string
    comment?: string
    items?: { reviewName?: string }[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const email = await getSessionEmail()

  try {
    if (body.action === "draft") {
      const names = (body.items ?? [])
        .map((i) => i.reviewName)
        .filter((n): n is string => typeof n === "string")
        .slice(0, 20)
      if (names.length === 0) {
        return NextResponse.json({ error: "下書きを作るクチコミがありません" }, { status: 400 })
      }
      // 画面から送られた内容は使わず、控えてある本文から作る
      const rows = rowsOf(
        await db.execute(sql`
          select review_name, location_name, reviewer, star_rating, comment
          from reviews_archive
          where review_name in (${sql.join(
            names.map((n) => sql`${n}`),
            sql`, `
          )})
          union all
          select n.review_name, n.location_name, n.reviewer, n.star_rating, n.comment
          from review_notices n
          where n.review_name in (${sql.join(
            names.map((n) => sql`${n}`),
            sql`, `
          )})
            and not exists (select 1 from reviews_archive r where r.review_name = n.review_name)
        `)
      )
      const drafts: { reviewName: string; draft: string; source: string }[] = []
      for (const r of rows) {
        const d = await createDraft(
          {
            reviewName: String(r.review_name),
            locationName: String(r.location_name),
            reviewer: r.reviewer ? String(r.reviewer) : null,
            starRating: r.star_rating == null ? null : Number(r.star_rating),
            comment: r.comment ? String(r.comment) : null,
          },
          email
        )
        drafts.push({ reviewName: String(r.review_name), ...d })
      }
      return NextResponse.json({ success: true, drafts })
    }

    const locationName = normalizeLocation(body.locationName)
    if (!body.reviewName || !locationName) {
      return NextResponse.json({ error: "クチコミと店舗を指定してください" }, { status: 400 })
    }

    if (body.action === "save") {
      await saveDraft(body.reviewName, locationName, (body.draft ?? "").slice(0, 4000), email)
      return NextResponse.json({ success: true })
    }
    if (body.action === "skip" || body.action === "unskip") {
      await setDraftStatus(body.reviewName, locationName, body.action === "skip" ? "skipped" : "draft")
      return NextResponse.json({ success: true })
    }
    if (body.action === "post") {
      const rl = checkRateLimit(`reply-post:${getClientId(request)}`, { windowMs: 60_000, max: 30 })
      if (!rl.allowed) {
        return NextResponse.json(
          { error: "少し時間をおいてから、もう一度お試しください。" },
          { status: 429 }
        )
      }
      const result = await postApprovedReply(body.reviewName, locationName, body.comment ?? "", email)
      return NextResponse.json({ success: true, result })
    }
    return NextResponse.json({ error: "操作が指定されていません" }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // 入力の不備は、そのまま画面に伝える
    if (/正しくありません|空です|長すぎます|認証がありません/.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return errorResponse("処理できませんでした", e)
  }
}
