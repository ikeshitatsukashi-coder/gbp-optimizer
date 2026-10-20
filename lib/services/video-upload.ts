/**
 * 外部ツールから受け取る動画（Google の「写真・動画」欄に載せる採用ムービー等）の共通ルール。
 * 置き場所は Vercel Blob の post-videos/<会社コード or 店舗ID>/ に限る。
 */

/** Google の写真・動画欄に載せられる動画の上限（75MB） */
export const VIDEO_MAX_BYTES = 75 * 1024 * 1024
export const VIDEO_TYPES = ["video/mp4", "video/quicktime"]

/**
 * 予約に渡された動画URLが、このツールの Blob の、その店舗のフォルダに置いた物かを確かめる。
 * 他社のフォルダや外部のURLを Google に取りに行かせないため。
 */
export function isOwnVideoUrl(raw: string, folder: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== "https:") return false
  if (!u.hostname.endsWith(".public.blob.vercel-storage.com")) return false
  return u.pathname.startsWith(`/post-videos/${folder}/`)
}
