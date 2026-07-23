/**
 * ブラウザ側で画像を GBP 向けにリサイズするユーティリティ。
 * - 最大 2540×1430 に収まるよう縮小（アスペクト比維持・拡大はしない）
 * - JPEG (q=0.85) に変換してファイルサイズも抑える
 * - サーバー処理不要（コストゼロ）
 */

export const MAX_WIDTH = 2540
export const MAX_HEIGHT = 1430
/** Vercel Function のリクエスト上限(4.5MB)を必ず下回るための安全上限 */
const SAFE_MAX_BYTES = 3.8 * 1024 * 1024

export interface ResizedImage {
  blob: Blob
  fileName: string
  width: number
  height: number
}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG 変換に失敗しました"))),
      "image/jpeg",
      quality
    )
  })
}

function drawScaled(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  ctx.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

export async function resizeImageForGbp(file: File): Promise<ResizedImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(
      "この画像形式は読み込めませんでした（HEIC等）。JPEGまたはPNGでお試しください。"
    )
  }
  const { width: ow, height: oh } = bitmap

  // 収まる倍率を計算（拡大はしない）
  let scale = Math.min(MAX_WIDTH / ow, MAX_HEIGHT / oh, 1)
  let width = Math.round(ow * scale)
  let height = Math.round(oh * scale)

  // GBP の最低要件（250×250 以上）
  if (width < 250 || height < 250) {
    bitmap.close()
    throw new Error(`画像が小さすぎます（${width}×${height}）。250×250px 以上が必要です。`)
  }

  let canvas = drawScaled(bitmap, width, height)
  let quality = 0.85
  let blob = await toJpegBlob(canvas, quality)

  // 4.5MB 上限を必ず下回るまで、品質→寸法の順で段階的に圧縮
  let guard = 0
  while (blob.size > SAFE_MAX_BYTES && guard < 8) {
    guard++
    if (quality > 0.5) {
      quality -= 0.15
    } else {
      // 品質を落としても大きい場合は寸法を 85% ずつ縮小
      scale *= 0.85
      width = Math.round(ow * scale)
      height = Math.round(oh * scale)
      if (width < 250 || height < 250) break
      canvas = drawScaled(bitmap, width, height)
    }
    blob = await toJpegBlob(canvas, quality)
  }
  bitmap.close()

  if (blob.size < 10 * 1024) {
    throw new Error("画像ファイルが小さすぎます（10KB 以上が必要）。")
  }
  if (blob.size > SAFE_MAX_BYTES) {
    throw new Error("画像を十分に圧縮できませんでした。別の画像でお試しください。")
  }

  const baseName = file.name.replace(/\.[^.]+$/, "")
  return {
    blob,
    fileName: `${baseName}.jpg`,
    width,
    height,
  }
}
