import { put, list, del, type PutBlobResult } from "@vercel/blob"

/**
 * Vercel Blob を使った画像ストレージのヘルパー。
 *
 * GBP の投稿画像は「インターネット上に公開された URL」でなければ使えないため、
 * PC からアップロードした画像を Blob に保存して公開 URL を得る。
 *
 * 必要な環境変数: BLOB_READ_WRITE_TOKEN
 *   Vercel ダッシュボード → Storage → Blob を作成すると自動で払い出される。
 *   ローカルは `vercel env pull .env.local` で取得。
 *
 * トークン未設定でも import 時にエラーにならないよう、呼び出し時にだけ検証する。
 */

const IMAGE_PREFIX = "gbp-posts"
const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

function ensureConfigured() {
  if (!isBlobConfigured()) {
    throw new Error(
      "画像ストレージ（Vercel Blob）が未設定です。Vercel の Storage で Blob を作成し、BLOB_READ_WRITE_TOKEN を設定してください。"
    )
  }
}

export interface StoredImage {
  url: string
  pathname: string
  size: number
  uploadedAt: string
}

/**
 * 画像を 1 枚アップロードして公開 URL を返す。
 */
export async function uploadImage(file: File): Promise<PutBlobResult> {
  ensureConfigured()
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(
      `対応していない画像形式です（${file.type || "不明"}）。JPEG / PNG / WebP / GIF のみ対応しています。`
    )
  }
  if (file.size > MAX_SIZE) {
    throw new Error("画像サイズが大きすぎます（上限 10MB）。")
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "image"
  return put(`${IMAGE_PREFIX}/${safeName}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  })
}

/**
 * アップロード済みの画像一覧（画像ライブラリ用）。
 * トークン未設定時は空配列を返して UI を壊さない。
 */
export async function listImages(): Promise<StoredImage[]> {
  if (!isBlobConfigured()) return []
  const res = await list({ prefix: `${IMAGE_PREFIX}/` })
  return res.blobs
    .filter((b) => !b.pathname.endsWith("/"))
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
    .map((b) => ({
      url: b.url,
      pathname: b.pathname,
      size: b.size,
      uploadedAt: b.uploadedAt.toISOString(),
    }))
}

/**
 * 画像ライブラリから削除。
 */
export async function deleteImage(url: string): Promise<void> {
  ensureConfigured()
  await del(url)
}
