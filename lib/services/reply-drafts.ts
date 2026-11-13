import { db } from "@/lib/db"
import { industryDefaults, reviewReplyDrafts, reviewsArchive, stores } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { createGmbClient } from "@/lib/gbp-client"
import { generateReviewReply } from "@/lib/services/generate-review-reply"
import { withGoogleAuth } from "@/lib/services/google-read"

/**
 * クチコミ返信の下書き。
 *
 * - 下書きは担当が1件ずつ確認して「承認して投稿」を押すまで Google には出ない。
 * - AIの鍵（ANTHROPIC_API_KEY）が入っていればAIで作り、無ければ業種ごとの定型文から作る。
 *   定型文は内容に踏み込まない無難な文面なので、担当が一言足してから投稿する前提。
 * - 投稿の直前に必ず Google の今の状態を見て、すでに返信が付いていれば上書きしない。
 */

export interface ReviewForDraft {
  reviewName: string
  locationName: string
  reviewer: string | null
  starRating: number | null
  comment: string | null
}

export function aiReady(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

/** Google が付ける翻訳文を落として原文だけにする */
export function original(comment: string | null): string {
  if (!comment) return ""
  const j = comment.indexOf("(Original)")
  if (j >= 0) return comment.slice(j + "(Original)".length).trim()
  const i = comment.indexOf("(Translated by Google)")
  return (i >= 0 ? comment.slice(0, i) : comment).trim()
}

/** 同じクチコミには毎回同じ言い回しを選ぶ（押すたびに文面が変わらないように） */
function pick<T>(list: T[] | null | undefined, key: string): T | null {
  if (!list || list.length === 0) return null
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return list[h % list.length]
}

/**
 * 定型文から返信案を作る。投稿者がお客様かどうか分からない業種が多いので、
 * 「ご来店」「ご利用」などは使わず、どの業種でも通る言い回しにしている。
 */
export function templateReply(input: {
  reviewName: string
  reviewer: string | null
  starRating: number | null
  comment: string | null
  closings?: string[] | null
  templatesLowNoComment?: string[] | null
  templatesHighNoComment?: string[] | null
}): string {
  const star = input.starRating ?? 0
  const hasComment = original(input.comment).length > 0
  const name = input.reviewer?.trim()
  const head = name ? `${name} 様\n` : ""
  const closing =
    pick(input.closings, input.reviewName) ?? "今後ともよろしくお願い申し上げます。"

  if (!hasComment) {
    const t =
      star <= 2
        ? pick(input.templatesLowNoComment, input.reviewName)
        : pick(input.templatesHighNoComment, input.reviewName)
    if (t) return head + t
    return (
      head +
      (star <= 2
        ? "ご評価をいただき、ありがとうございます。お気づきの点がございましたら、ぜひ具体的にお聞かせください。いただいたご意見をもとに、改善に努めてまいります。"
        : `ご評価をいただき、誠にありがとうございます。${closing}`)
    )
  }
  if (star >= 4) {
    return `${head}この度は高いご評価とあたたかいお言葉をいただき、誠にありがとうございます。いただいたお声は、スタッフ一同の大きな励みになります。${closing}`
  }
  if (star === 3) {
    return `${head}この度はご評価とご意見をいただき、ありがとうございます。いただいた内容を社内で共有し、より良い対応につなげてまいります。${closing}`
  }
  return `${head}この度は貴重なご意見をいただき、ありがとうございます。ご不快な思いをおかけしましたこと、お詫び申し上げます。いただいた内容は社内で共有し、事実を確認のうえ改善に努めてまいります。${closing}`
}

/**
 * 下書きを作って保存する。すでに下書きがあるクチコミは作り直さず、今あるものを返す
 * （担当が直した文面を消さないため）。
 */
export async function createDraft(
  review: ReviewForDraft,
  createdBy: string | null
): Promise<{ draft: string; source: string }> {
  const [existing] = await db
    .select({ draft: reviewReplyDrafts.draft, source: reviewReplyDrafts.source })
    .from(reviewReplyDrafts)
    .where(eq(reviewReplyDrafts.reviewName, review.reviewName))
  if (existing) return existing

  let draft = ""
  let source = "template"
  if (aiReady() && original(review.comment).length > 0) {
    try {
      const r = await generateReviewReply({
        reviewName: review.reviewName,
        override: {
          reviewer: review.reviewer,
          starRating: review.starRating,
          comment: original(review.comment),
        },
      })
      draft = r.reply
      source = "ai"
    } catch {
      draft = ""
    }
  }
  if (!draft) {
    const [row] = await db
      .select({
        closings: industryDefaults.closings,
        low: industryDefaults.templatesLowNoComment,
        high: industryDefaults.templatesHighNoComment,
      })
      .from(stores)
      .leftJoin(industryDefaults, eq(industryDefaults.industry, stores.industry))
      .where(eq(stores.locationName, review.locationName))
    draft = templateReply({
      ...review,
      closings: row?.closings,
      templatesLowNoComment: row?.low,
      templatesHighNoComment: row?.high,
    })
  }
  await db
    .insert(reviewReplyDrafts)
    .values({
      reviewName: review.reviewName,
      locationName: review.locationName,
      draft,
      source,
      createdBy,
    })
    .onConflictDoNothing()
  return { draft, source }
}

/** 担当が直した文面を保存する */
export async function saveDraft(
  reviewName: string,
  locationName: string,
  draft: string,
  by: string | null
): Promise<void> {
  await db
    .insert(reviewReplyDrafts)
    .values({ reviewName, locationName, draft, source: "manual", createdBy: by })
    .onConflictDoUpdate({
      target: reviewReplyDrafts.reviewName,
      set: { draft, source: "manual", status: "draft", updatedAt: new Date() },
    })
}

export async function setDraftStatus(
  reviewName: string,
  locationName: string,
  status: "draft" | "skipped"
): Promise<void> {
  await db
    .insert(reviewReplyDrafts)
    .values({ reviewName, locationName, draft: "", status })
    .onConflictDoUpdate({
      target: reviewReplyDrafts.reviewName,
      set: { status, updatedAt: new Date() },
    })
}

export type PostReplyResult =
  | { status: "posted" }
  /** すでに Google 側で返信が付いていたので、何もしなかった */
  | { status: "already"; existingReply: string }
  /** クチコミが Google から消えていた */
  | { status: "gone" }

/**
 * 承認された返信を1件だけ Google に投稿する。
 * 投稿の直前に今の状態を読み、すでに返信があれば上書きしない
 * （取り込みが古いと、担当やお客様が別の場所で返信済みのことがあるため）。
 */
export async function postApprovedReply(
  reviewName: string,
  locationName: string,
  comment: string,
  by: string | null
): Promise<PostReplyResult> {
  if (!/^accounts\/\d+\/locations\/\d+\/reviews\/[A-Za-z0-9_-]+$/.test(reviewName)) {
    throw new Error("クチコミの指定が正しくありません")
  }
  const text = comment.trim()
  if (!text) throw new Error("返信の文面が空です")
  if (text.length > 4000) throw new Error("返信が長すぎます（4000文字まで）")

  const result = await withGoogleAuth<PostReplyResult>(async (token) => {
    const res = await fetch(`https://mybusiness.googleapis.com/v4/${reviewName}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 404) return { status: "gone" }
    if (!res.ok) throw new Error(`GMB API error: ${res.status} ${await res.text()}`)
    const live = (await res.json()) as { reviewReply?: { comment?: string } }
    const existingReply = live.reviewReply?.comment?.trim()
    if (existingReply) return { status: "already", existingReply }

    await createGmbClient(token).replyToReview(reviewName, text)
    return { status: "posted" }
  })

  if (result.status === "posted") {
    // ツール内の表示もすぐ「返信済み」にする（既存の一括返信と同じ扱い）
    await db
      .update(reviewsArchive)
      .set({ replyComment: text, replyUpdateTime: new Date(), updatedAt: sql`now()` })
      .where(eq(reviewsArchive.reviewName, reviewName))
    await db
      .insert(reviewReplyDrafts)
      .values({
        reviewName,
        locationName,
        draft: text,
        source: "manual",
        status: "posted",
        postedAt: new Date(),
        postedBy: by,
      })
      .onConflictDoUpdate({
        target: reviewReplyDrafts.reviewName,
        set: { draft: text, status: "posted", postedAt: new Date(), postedBy: by, updatedAt: new Date() },
      })
  } else {
    // 返信済み・削除済みのものは、一覧に出し続けないよう「見送り」にしておく
    await setDraftStatus(reviewName, locationName, "skipped")
  }
  return result
}
