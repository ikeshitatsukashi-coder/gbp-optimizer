/**
 * ブラウザ側で画像を GBP 向けにリサイズするユーティリティ。
 * - 最大 2540×1430 に収まるよう縮小（アスペクト比維持・拡大はしない）
 * - JPEG (q=0.85) に変換してファイルサイズも抑える
 * - iPhone の HEIC/HEIF は、ブラウザが読めないので先に JPEG へ変換する
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

/** HEIF系のブランド（ftypボックスの4文字）。iPhoneの写真は heic / heix が多い */
const HEIF_BRANDS = [
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]

/**
 * HEIC/HEIF かどうか。
 * 拡張子やMIMEは環境によって空になることがあるため、最後は先頭バイトで判定する。
 */
export async function isHeicFile(file: File): Promise<boolean> {
  if (/\.(heic|heif|hif)$/i.test(file.name)) return true
  if (/^image\/(heic|heif)/i.test(file.type)) return true
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    if (head.length < 12) return false
    const ascii = (from: number, to: number) =>
      String.fromCharCode(...head.slice(from, to))
    if (ascii(4, 8) !== "ftyp") return false
    return HEIF_BRANDS.includes(ascii(8, 12).toLowerCase())
  } catch {
    return false
  }
}

/** 画像の向き（EXIF）を反映して読み込む。未対応ブラウザでは指定なしで読み直す */
async function bitmapFrom(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" })
  } catch {
    return await createImageBitmap(blob)
  }
}

/**
 * 画像を ImageBitmap にする。
 * HEIC/HEIF はブラウザが直接デコードできない（Safari を除く）ため、
 * 必要になったときだけ変換ライブラリを読み込んで JPEG にしてから扱う。
 * ※ heic-to は LGPL-3.0。社内ツールでの利用のため、改変せずそのまま読み込む。
 */
async function decodeToBitmap(
  file: File,
  onConvertStart?: () => void
): Promise<ImageBitmap> {
  try {
    return await bitmapFrom(file)
  } catch {
    // 下のHEIC変換にフォールバックする
  }

  if (await isHeicFile(file)) {
    onConvertStart?.()
    let jpeg: Blob
    try {
      const { heicTo } = await import("heic-to")
      jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 })
    } catch {
      throw new Error(
        "HEIC画像の変換に失敗しました。iPhoneの「設定 → カメラ → フォーマット」を" +
          "「互換性優先」にするか、JPEGに書き出してからお試しください。"
      )
    }
    try {
      return await bitmapFrom(jpeg)
    } catch {
      throw new Error("HEIC画像を変換できましたが、読み込みに失敗しました。")
    }
  }

  throw new Error("この画像形式は読み込めませんでした。JPEG・PNG・HEICでお試しください。")
}

export async function resizeImageForGbp(
  file: File,
  /** HEICの変換を始めたときに呼ばれる（画面に「変換中」を出すため） */
  onConvertStart?: () => void
): Promise<ResizedImage> {
  const bitmap = await decodeToBitmap(file, onConvertStart)
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
