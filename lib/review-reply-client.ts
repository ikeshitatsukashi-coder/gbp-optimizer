import { fetchJson } from "@/lib/fetch-json"

/**
 * クチコミ返信の下書きを扱う、画面側の共通の呼び出し。
 * 「低評価クチコミのお知らせ」と「クチコミ返信の下書き」の両方の画面から使う。
 */

export type PostOutcome =
  | { ok: true; status: "posted" }
  | { ok: true; status: "already"; existingReply: string }
  | { ok: true; status: "gone" }
  | { ok: false; error: string }

async function call(body: Record<string, unknown>) {
  return fetchJson<{ result?: { status: string; existingReply?: string } }>("/api/review-replies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export async function saveReplyDraft(reviewName: string, locationName: string, draft: string) {
  const r = await call({ action: "save", reviewName, locationName, draft })
  return r.ok ? null : (r.error ?? "保存できませんでした")
}

export async function skipReply(reviewName: string, locationName: string, skip: boolean) {
  const r = await call({ action: skip ? "skip" : "unskip", reviewName, locationName })
  return r.ok ? null : (r.error ?? "変更できませんでした")
}

/** 承認した1件を Google に投稿する。すでに返信が付いていた場合は上書きせず、その旨を返す */
export async function postReply(
  reviewName: string,
  locationName: string,
  comment: string
): Promise<PostOutcome> {
  const r = await call({ action: "post", reviewName, locationName, comment })
  if (!r.ok || !r.data?.result) return { ok: false, error: r.error ?? "投稿できませんでした" }
  const res = r.data.result
  if (res.status === "already") {
    return { ok: true, status: "already", existingReply: res.existingReply ?? "" }
  }
  if (res.status === "gone") return { ok: true, status: "gone" }
  return { ok: true, status: "posted" }
}

export const DRAFT_SOURCE_LABEL: Record<string, string> = {
  ai: "AIが作成",
  template: "定型文から作成",
  manual: "担当が編集",
}

export function stars(n: number): string {
  const v = Math.max(0, Math.min(5, n))
  return "★".repeat(v) + "☆".repeat(5 - v)
}

export function fmtDay(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  })
}
