import { db } from "@/lib/db"
import { appSettings, reviewNotices } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { createGmbClient } from "@/lib/gbp-client"
import { withGoogleRead, isGoogleAuthError } from "@/lib/services/google-read"
import { createDraft } from "@/lib/services/reply-drafts"
import { isMailConfigured, sendReviewRequestMail } from "@/lib/services/mailer"

/**
 * 低評価クチコミの新着を見つけて控える。
 *
 * - Google から各店舗の新しいクチコミを「読むだけ」。クチコミの取り込み結果（reviews_archive）には
 *   書き込まない。見つけた低評価は、専用の控え（review_notices）にだけ入れる。
 * - 対象は、投稿を登録している運用中の店舗（＝進捗確認の画面に出ている店舗）。
 * - 拾うのは「星1〜2・直近30日以内・まだ返信が付いていない」もの。昔の低評価を一斉に並べない。
 */

export const LOOKBACK_DAYS = 30
const CHECK_KEY = "low_review_check"
const NOTIFY_EMAIL_KEY = "low_review_notify_email"

const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

interface GReview {
  name?: string
  reviewer?: { displayName?: string }
  starRating?: string
  comment?: string
  createTime?: string
  reviewReply?: { comment?: string }
}

export interface LowReviewCheck {
  at: string
  by: string
  checkedStores: number
  found: number
  errors: number
  /** 認証が通らず、確認そのものができなかった */
  authFailed?: boolean
}

function rowsOf(r: unknown): Record<string, unknown>[] {
  return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[]
}

export async function getLastCheck(): Promise<LowReviewCheck | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, CHECK_KEY))
  if (!row) return null
  try {
    return JSON.parse(row.value) as LowReviewCheck
  } catch {
    return null
  }
}

export async function getNotifyEmail(): Promise<string> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, NOTIFY_EMAIL_KEY))
  return row?.value ?? ""
}

export async function setNotifyEmail(email: string, by: string | null): Promise<void> {
  const value = email.trim()
  if (!value) {
    await db.delete(appSettings).where(eq(appSettings.key, NOTIFY_EMAIL_KEY))
    return
  }
  await db
    .insert(appSettings)
    .values({ key: NOTIFY_EMAIL_KEY, value, updatedBy: by })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedBy: by, updatedAt: new Date() },
    })
}

async function saveCheck(c: LowReviewCheck): Promise<void> {
  const value = JSON.stringify(c)
  await db
    .insert(appSettings)
    .values({ key: CHECK_KEY, value, updatedBy: "system" })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedBy: "system", updatedAt: new Date() },
    })
}

export async function checkLowReviews(by: string): Promise<LowReviewCheck & { newCount: number }> {
  const targets = rowsOf(
    await db.execute(sql`
      select s.location_name, s.account_name, s.title
      from stores s
      where s.status = 'active'
        and (s.has_voice_of_merchant is null or s.has_voice_of_merchant = true)
        and s.duplicate_of is null
        and exists (select 1 from scheduled_posts p where p.location_name = s.location_name)
      order by s.title
    `)
  ).map((r) => ({
    locationName: String(r.location_name),
    accountName: String(r.account_name),
    title: String(r.title),
  }))

  const since = Date.now() - LOOKBACK_DAYS * 86400e3
  const found: {
    reviewName: string
    locationName: string
    title: string
    reviewer: string | null
    starRating: number
    comment: string | null
    createTime: Date
  }[] = []
  let errors = 0

  const readStore = async (token: string, t: (typeof targets)[number]) => {
    const res = (await createGmbClient(token).listReviews(t.accountName, t.locationName, 50)) as {
      reviews?: GReview[]
    }
    for (const r of res.reviews ?? []) {
      const star = STAR[r.starRating ?? ""] ?? 0
      if (!r.name || !r.createTime || star === 0 || star > 2) continue
      const created = new Date(r.createTime)
      if (created.getTime() < since) continue
      if (r.reviewReply?.comment?.trim()) continue
      found.push({
        reviewName: r.name,
        locationName: t.locationName,
        title: t.title,
        reviewer: r.reviewer?.displayName ?? null,
        starRating: star,
        comment: r.comment ?? null,
        createTime: created,
      })
    }
  }

  let authFailed = false
  try {
    await withGoogleRead(async (token) => {
      found.length = 0
      errors = 0
      if (targets.length === 0) return
      // 1店舗目で認証を確かめる（切れていれば、ここで次の認証に切り替わる）
      await readStore(token, targets[0])
      const rest = targets.slice(1)
      let index = 0
      const worker = async () => {
        while (true) {
          const i = index++
          if (i >= rest.length) break
          try {
            await readStore(token, rest[i])
          } catch {
            errors++
          }
        }
      }
      await Promise.all(Array.from({ length: 5 }, worker))
    })
  } catch (e) {
    if (isGoogleAuthError(e)) authFailed = true
    else errors++
  }

  // 新しく見つけたものだけ控える（前に控えたものは触らない）
  const inserted: typeof found = []
  for (const f of found) {
    const r = await db
      .insert(reviewNotices)
      .values({
        reviewName: f.reviewName,
        locationName: f.locationName,
        reviewer: f.reviewer,
        starRating: f.starRating,
        comment: f.comment,
        reviewCreateTime: f.createTime,
      })
      .onConflictDoNothing()
      .returning({ reviewName: reviewNotices.reviewName })
    if (r.length > 0) inserted.push(f)
  }
  // 返信案を用意しておく（失敗しても控えは残す。画面から作り直せる）
  for (const f of inserted) {
    await createDraft(
      {
        reviewName: f.reviewName,
        locationName: f.locationName,
        reviewer: f.reviewer,
        starRating: f.starRating,
        comment: f.comment,
      },
      "system"
    ).catch(() => {})
  }

  const check: LowReviewCheck = {
    at: new Date().toISOString(),
    by,
    checkedStores: authFailed ? 0 : targets.length,
    found: found.length,
    errors,
    ...(authFailed ? { authFailed: true } : {}),
  }
  await saveCheck(check)

  // 受け取り先が登録されていれば、新着があった時だけ社内にメールで知らせる
  if (inserted.length > 0 && isMailConfigured()) {
    const to = await getNotifyEmail()
    if (to) {
      const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "")
      const lines = inserted.map(
        (f) =>
          `■ ${f.title}\n  評価：星${f.starRating} ／ 投稿日：${f.createTime.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })} ／ 投稿者：${f.reviewer ?? "匿名"}\n  ${(f.comment ?? "（コメントなし）").slice(0, 300)}`
      )
      await sendReviewRequestMail({
        to,
        subject: `【低評価クチコミ】新着が${inserted.length}件あります`,
        text: `低評価（星1〜2）のクチコミに新着があります。返信案を用意しました。\n\n${lines.join("\n\n")}\n\n確認と対応はこちらから：\n${base}/review-notices\n`,
      }).catch(() => {})
    }
  }

  return { ...check, newCount: inserted.length }
}
