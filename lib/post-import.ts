/**
 * 一括投稿インポートの共通パースロジック（DB 非依存・純粋関数）。
 * CSV / Excel / Google スプレッドシートいずれも、最終的に
 * 「ヘッダー行 + データ行の 2 次元配列」に落としてからここで正規化する。
 */

export type Cell = string | number | boolean | Date | null | undefined

/** 日本語ラベル / 英語 enum どちらも受け付ける投稿タイプ */
const POST_TYPE_MAP: Record<string, string> = {
  最新情報: "STANDARD",
  イベント: "EVENT",
  特典: "OFFER",
  お知らせ: "ALERT",
  standard: "STANDARD",
  event: "EVENT",
  offer: "OFFER",
  alert: "ALERT",
}

/** 日本語ラベル / 英語 enum どちらも受け付ける CTA タイプ */
const CTA_TYPE_MAP: Record<string, string> = {
  なし: "",
  予約: "BOOK",
  注文: "ORDER",
  ショップ: "SHOP",
  詳細: "LEARN_MORE",
  詳細を見る: "LEARN_MORE",
  登録: "SIGN_UP",
  電話: "CALL",
  book: "BOOK",
  order: "ORDER",
  shop: "SHOP",
  learn_more: "LEARN_MORE",
  sign_up: "SIGN_UP",
  call: "CALL",
}

/** 各項目に対応するヘッダー名の候補（正規化して比較） */
const FIELD_ALIASES: Record<string, string[]> = {
  store: ["店舗id", "店舗id(locationname)", "店舗", "店舗名", "locationname", "location", "store"],
  postType: ["投稿タイプ", "タイプ", "posttype", "type"],
  summary: ["本文", "投稿本文", "内容", "summary", "text", "body"],
  mediaUrls: ["画像url", "画像url(カンマ区切りで複数可)", "画像", "media", "mediaurl", "mediaurls", "image"],
  ctaType: ["ctaタイプ", "cta", "ctatype", "actiontype", "行動を促すボタン"],
  ctaUrl: ["cta_url", "ctaurl", "ctaのurl", "リンク", "url"],
  scheduledFor: ["投稿日時", "投稿日時(例 2026/07/10 09:00)", "予約日時", "日時", "scheduledfor", "date", "datetime"],
}

function normalizeKey(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[　]/g, "")
}

export interface ParsedPostRow {
  rowNumber: number
  store: string
  postType: string
  summary: string
  mediaUrls: string[]
  callToAction: { actionType: string; url: string } | null
  scheduledFor: Date | null
}

export interface RowError {
  rowNumber: number
  message: string
}

function toStr(cell: Cell): string {
  if (cell === null || cell === undefined) return ""
  if (cell instanceof Date) return cell.toISOString()
  return String(cell).trim()
}

function parseDate(cell: Cell): Date | null {
  if (cell === null || cell === undefined || cell === "") return null
  if (cell instanceof Date) return isNaN(cell.getTime()) ? null : cell
  const s = String(cell).trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/**
 * ヘッダー行から「項目 → 列インデックス」の対応表を作る。
 */
function buildHeaderMap(headerRow: Cell[]): Record<string, number> {
  const map: Record<string, number> = {}
  headerRow.forEach((h, idx) => {
    const key = normalizeKey(toStr(h))
    if (!key) return
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (map[field] !== undefined) continue
      if (aliases.includes(key)) {
        map[field] = idx
        break
      }
    }
  })
  return map
}

/**
 * 2 次元配列（1 行目ヘッダー）を正規化済みの投稿行に変換する。
 * 本文が空の行はスキップ（テンプレの空欄行を無視するため）。
 */
export function parseMatrix(matrix: Cell[][]): {
  rows: ParsedPostRow[]
  errors: RowError[]
} {
  const rows: ParsedPostRow[] = []
  const errors: RowError[] = []

  if (!matrix || matrix.length < 2) {
    return { rows, errors }
  }

  const headerMap = buildHeaderMap(matrix[0])

  if (headerMap.summary === undefined || headerMap.store === undefined) {
    errors.push({
      rowNumber: 1,
      message:
        "ヘッダー行に『店舗ID(locationName)』と『本文』の列が見つかりません。テンプレートをダウンロードして形式をご確認ください。",
    })
    return { rows, errors }
  }

  const get = (row: Cell[], field: string): Cell =>
    headerMap[field] !== undefined ? row[headerMap[field]] : ""

  for (let i = 1; i < matrix.length; i++) {
    const rowNumber = i + 1 // 1-based, ヘッダー込み
    const row = matrix[i]
    if (!row || row.every((c) => toStr(c) === "")) continue

    const summary = toStr(get(row, "summary"))
    if (!summary) continue // 空欄行はスキップ

    const store = toStr(get(row, "store"))
    if (!store) {
      errors.push({ rowNumber, message: "店舗ID(または店舗名)が空です。" })
      continue
    }

    const rawType = normalizeKey(toStr(get(row, "postType")))
    const postType = POST_TYPE_MAP[rawType] ?? "STANDARD"

    const mediaUrls = toStr(get(row, "mediaUrls"))
      .split(/[,、\s]+/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//.test(u))

    const rawCta = normalizeKey(toStr(get(row, "ctaType")))
    const ctaType = CTA_TYPE_MAP[rawCta] ?? ""
    const ctaUrl = toStr(get(row, "ctaUrl"))
    const callToAction =
      ctaType && (ctaType === "CALL" || ctaUrl)
        ? { actionType: ctaType, url: ctaUrl }
        : null

    const scheduledCell = get(row, "scheduledFor")
    const scheduledFor = parseDate(scheduledCell)
    if (toStr(scheduledCell) && !scheduledFor) {
      errors.push({
        rowNumber,
        message: `投稿日時「${toStr(scheduledCell)}」を認識できませんでした（例: 2026/07/10 09:00）。`,
      })
      continue
    }

    rows.push({
      rowNumber,
      store,
      postType,
      summary,
      mediaUrls,
      callToAction,
      scheduledFor,
    })
  }

  return { rows, errors }
}

/**
 * Google スプレッドシートの共有 URL を CSV エクスポート URL に変換する。
 * 「リンクを知っている全員が閲覧可」で共有 or ウェブに公開されたシートで動作する。
 * OAuth スコープには一切依存しない。
 */
export function toSheetCsvUrl(sheetUrl: string): string | null {
  const m = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!m) return null
  const id = m[1]
  const gidMatch = sheetUrl.match(/[#&?]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : "0"
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
}
