import { randomBytes } from "node:crypto"
import { db } from "@/lib/db"
import { storeFeatures, trackedLinks } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

/**
 * 投稿のボタンのクリック数を数えるための仕組み。
 *
 * Google は「投稿ごとにボタンが何回押されたか」を返さなくなった（2026-11 に確認。
 * 以前あった投稿ごとの集計の窓口は廃止されていた）。そこで、ボタンのリンク先を
 * いったんこのツールのURL（/api/public/r/...）にして回数を数え、すぐ本来のリンク先へ送る。
 *
 * - 店舗ごとにONにした場合だけ働く。何も設定していない店舗は従来どおり元のURLで投稿される。
 * - 計測用のURLを作れなかったときは null を返す。呼び出し側は元のURLのまま投稿すること
 *   （計測のせいで投稿が止まることがあってはならない）。
 */

/** 計測用URLの土台。本番（https）以外では作らない */
export function trackingBaseUrl(): string | null {
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "")
  return /^https:\/\//.test(base) ? base : null
}

/** 予約投稿1件に対応する計測リンクの名前 */
export function labelOfScheduledPost(postId: number): string {
  return `sp-${postId}`
}

export async function isTrackingOn(locationName: string): Promise<boolean> {
  const [row] = await db
    .select({ on: storeFeatures.trackPostClicks })
    .from(storeFeatures)
    .where(eq(storeFeatures.locationName, locationName))
  return row?.on === true
}

/**
 * この投稿のボタンを計測用URLに差し替えるならそのURLを返す。差し替えないなら null。
 */
export async function trackedUrlForPost(post: {
  id: number
  locationName: string
  callToAction: { actionType?: string; url?: string } | null
}): Promise<string | null> {
  const original = post.callToAction?.url
  // 電話ボタンにはURLが無い
  if (!original || post.callToAction?.actionType === "CALL") return null
  const base = trackingBaseUrl()
  if (!base) return null
  let target: URL
  try {
    target = new URL(original)
  } catch {
    return null
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return null
  // すでに計測用URLになっているものを二重に包まない
  if (original.startsWith(`${base}/api/public/r/`)) return null
  if (!(await isTrackingOn(post.locationName))) return null

  const label = labelOfScheduledPost(post.id)
  const [found] = await db
    .select({ id: trackedLinks.id, token: trackedLinks.token, targetUrl: trackedLinks.targetUrl })
    .from(trackedLinks)
    .where(and(eq(trackedLinks.locationName, post.locationName), eq(trackedLinks.label, label)))
  if (found) {
    // 予約の内容が直されてリンク先が変わっていたら、転送先も合わせる
    if (found.targetUrl !== target.toString()) {
      await db
        .update(trackedLinks)
        .set({ targetUrl: target.toString() })
        .where(eq(trackedLinks.id, found.id))
    }
    return `${base}/api/public/r/${found.token}`
  }
  const token = randomBytes(18).toString("base64url")
  await db
    .insert(trackedLinks)
    .values({ token, locationName: post.locationName, label, targetUrl: target.toString() })
  return `${base}/api/public/r/${token}`
}
