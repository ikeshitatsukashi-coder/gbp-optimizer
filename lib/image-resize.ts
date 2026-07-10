/**
 * ブラウザ側で画像を GBP 向けにリサイズするユーティリティ。
 * - 最大 2540×1430 に収まるよう縮小（アスペクト比維持・拡大はしない）
 * - JPEG (q=0.85) に変換してファイルサイズも抑える
 * - サーバー処理不要（コストゼロ）
 */

export const MAX_WIDTH = 2540
export const MAX_HEIGHT = 1430

export interface ResizedImage {
  blob: Blob
  fileName: string
  width: number
  height: number
}

export async function resizeImageForGbp(file: File): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file)
  const { width: ow, height: oh } = bitmap

  // 収まる倍率を計算（拡大はしない）
  const scale = Math.min(MAX_WIDTH / ow, MAX_HEIGHT / oh, 1)
  const width = Math.round(ow * scale)
  const height = Math.round(oh * scale)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    bitmap.close()
    throw new Error("Canvas 2D context unavailable")
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG 変換に失敗しました"))),
      "image/jpeg",
      0.85
    )
  })

  // GBP の最低要件チェック（250×250 / 10KB 以上）
  if (width < 250 || height < 250) {
    throw new Error(`画像が小さすぎます（${width}×${height}）。250×250px 以上が必要です。`)
  }
  if (blob.size < 10 * 1024) {
    throw new Error("画像ファイルが小さすぎます（10KB 以上が必要）。")
  }

  const baseName = file.name.replace(/\.[^.]+$/, "")
  return {
    blob,
    fileName: `${baseName}.jpg`,
    width,
    height,
  }
}
