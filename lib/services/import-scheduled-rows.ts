import { db } from "@/lib/db"
import { scheduledPosts, stores } from "@/lib/db/schema"
import { normalizeSearchText } from "@/lib/search-normalize"

/**
 * 予約投稿の一括インポート共通ロジック。
 * xlsx（クライアント解析）と Google Sheets 直接読み取りの両方から利用。
 *
 * 期待するカラム（見出しのゆらぎは HEADER_ALIASES で吸収）:
 *   locationName / 店舗ID  (必須): "locations/12345" or "12345"
 *   店舗名 も可（あいまい照合あり）
 *   scheduledFor / 予約日時 (必須): "2026-07-15 10:00" or ISO
 *   summary / 本文        (必須)
 *   postType / 投稿タイプ  (省略時 STANDARD)
 *   mediaUrl / 画像URL    (任意)
 *   ctaType / CTA種別 / ctaUrl / CTAリンク (任意)
 *
 * 実投稿はせず status='pending' の予約として登録する。
 */

const HEADER_ALIASES: Record<string, string> = {
  locationname: "locationName",
  location_name: "locationName",
  店舗id: "locationName",
  ロケーションid: "locationName",
  locationid: "locationName",
  店舗名: "storeName",
  店舗: "storeName",
  店名: "storeName",
  会社名: "storeName",
  ビジネス名: "storeName",
  事業所名: "storeName",
  storename: "storeName",
  store_name: "storeName",
  scheduledfor: "scheduledFor",
  scheduled_for: "scheduledFor",
  予約日時: "scheduledFor",
  投稿日時: "scheduledFor",
  日時: "scheduledFor",
  summary: "summary",
  本文: "summary",
  投稿内容: "summary",
  内容: "summary",
  posttype: "postType",
  post_type: "postType",
  投稿タイプ: "postType",
  種別: "postType",
  mediaurl: "mediaUrl",
  media_url: "mediaUrl",
  画像url: "mediaUrl",
  画像: "mediaUrl",
  ctatype: "ctaType",
  cta_type: "ctaType",
  cta種別: "ctaType",
  ctaurl: "ctaUrl",
  cta_url: "ctaUrl",
  ctaリンク: "ctaUrl",
}

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[\s_-]/g, "").replace(/[()（）\[\]]/g, "")
}

/** canonical フィールド → シートの見出し名 の明示マッピング（列対応づけUI由来） */
export type ColumnMapping = Partial<Record<string, string>>

function pickField(
  row: Record<string, unknown>,
  canonical: string,
  mapping?: ColumnMapping
): unknown {
  // 明示マッピングがあれば最優先
  if (mapping && mapping[canonical]) {
    const header = mapping[canonical]!
    if (header in row) return row[header]
    // 見出しの前後空白ゆらぎに対応
    for (const [k, v] of Object.entries(row)) {
      if (k.trim() === header.trim()) return v
    }
  }
  const target = canonical.toLowerCase()
  for (const [rawKey, val] of Object.entries(row)) {
    const norm = normalizeKey(rawKey)
    if (HEADER_ALIASES[norm] === canonical) return val
    if (norm === target) return val
  }
  return undefined
}

/** 見出し配列から canonical フィールドを推定（マッピングUIの初期値用） */
export function suggestMapping(headers: string[]): ColumnMapping {
  const result: ColumnMapping = {}
  for (const h of headers) {
    const norm = normalizeKey(h)
    const canonical = HEADER_ALIASES[norm]
    if (canonical && !result[canonical]) result[canonical] = h
  }
  return result
}

const VALID_POST_TYPES = ["STANDARD", "EVENT", "OFFER", "ALERT"]
const VALID_CTA = ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"]

/**
 * 各種フォーマットの日時をゆるくパースする。
 * 対応: ISO / "2026-07-15 10:00" / "2026/07/15" / "2026年7月15日 10時" /
 *       Excelシリアル値(数値) / Date型
 */
function parseDateFlexible(raw: unknown): Date | null {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw

  // Excel シリアル値（1900/1/1 起点）
  if (typeof raw === "number" && raw > 0 && raw < 100000) {
    const ms = Math.round((raw - 25569) * 86400 * 1000)
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }

  if (typeof raw !== "string") return null
  let s = raw.trim()
  if (!s) return null

  // 全角数字・記号を半角へ
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

  // 和暦風「2026年7月15日 10時30分」→ "2026-07-15 10:30"
  const jp = s.match(
    /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?\s*(?:(\d{1,2})時\s*(?:(\d{1,2})分?)?)?/
  )
  if (jp) {
    const [, y, mo, da, hh = "0", mi = "0"] = jp
    const d = new Date(
      Number(y),
      Number(mo) - 1,
      Number(da),
      Number(hh),
      Number(mi)
    )
    return isNaN(d.getTime()) ? null : d
  }

  // "2026/07/15 10:00" / "2026-07-15T10:00" / "2026.07.15" などを正規化
  const norm = s.replace(/[./]/g, "-").replace(/\s+/, " ")
  let d = new Date(norm)
  if (!isNaN(d.getTime())) return d

  // 時刻なし日付にT00:00を補って再試行
  d = new Date(norm.replace(" ", "T"))
  return isNaN(d.getTime()) ? null : d
}

export interface ImportResult {
  success: true
  totalRows: number
  inserted: number
  errors: Array<{ rowIndex: number; error: string; rowData: unknown }>
}

export async function importScheduledRows(
  rows: Record<string, unknown>[],
  mapping?: ColumnMapping
): Promise<ImportResult> {
  const allStores = await db
    .select({ locationName: stores.locationName, title: stores.title })
    .from(stores)
  const byTitle = new Map(allStores.map((s) => [s.title, s.locationName]))
  const validLocationNames = new Set(allStores.map((s) => s.locationName))
  const byBareId = new Map(
    allStores.map((s) => [s.locationName.replace(/^locations\//, ""), s.locationName])
  )
  const byNormTitle = new Map<string, string[]>()
  for (const s of allStores) {
    const key = normalizeSearchText(s.title)
    const arr = byNormTitle.get(key)
    if (arr) arr.push(s.locationName)
    else byNormTitle.set(key, [s.locationName])
  }

  const resolveLocation = (locRaw: unknown, storeNameRaw: unknown): string | null => {
    if (typeof locRaw === "string" && locRaw.trim()) {
      const cleaned = locRaw.trim()
      const withPrefix = cleaned.startsWith("locations/")
        ? cleaned
        : `locations/${cleaned}`
      if (validLocationNames.has(withPrefix)) return withPrefix
      const bare = cleaned.replace(/^locations\//, "")
      if (byBareId.has(bare)) return byBareId.get(bare)!
    }
    if (typeof storeNameRaw === "string" && storeNameRaw.trim()) {
      const name = storeNameRaw.trim()
      if (byTitle.has(name)) return byTitle.get(name)!
      const norm = normalizeSearchText(name)
      const hit = byNormTitle.get(norm)
      if (hit && hit.length === 1) return hit[0]
    }
    return null
  }

  const errors: Array<{ rowIndex: number; error: string; rowData: unknown }> = []
  const toInsert: Array<{
    locationName: string
    scheduledFor: Date
    postType: string
    summary: string
    mediaUrls: string[] | null
    callToAction: { actionType?: string; url?: string } | null
  }> = []

  rows.forEach((row, idx) => {
    const rowIndex = idx + 2 // 1 = 見出し
    const locRaw = pickField(row, "locationName", mapping)
    const storeNameRaw = pickField(row, "storeName", mapping)
    const dateRaw = pickField(row, "scheduledFor", mapping)
    const summaryRaw = pickField(row, "summary", mapping)

    const locationName = resolveLocation(locRaw, storeNameRaw)
    if (!locationName) {
      const shown =
        (typeof storeNameRaw === "string" && storeNameRaw.trim()) ||
        (typeof locRaw === "string" && locRaw.trim()) ||
        "（店舗名・店舗ID列が空）"
      errors.push({ rowIndex, error: `店舗が特定できません: 「${shown}」`, rowData: row })
      return
    }

    const scheduledFor = parseDateFlexible(dateRaw)
    if (!scheduledFor) {
      const shown =
        dateRaw === undefined || dateRaw === null || dateRaw === ""
          ? "（日時の列が空、または列が未対応）"
          : JSON.stringify(dateRaw)
      errors.push({
        rowIndex,
        error: `予約日時を読み取れません: ${shown}`,
        rowData: row,
      })
      return
    }

    const summary = typeof summaryRaw === "string" ? summaryRaw.trim() : ""
    if (!summary) {
      errors.push({ rowIndex, error: "本文が空です", rowData: row })
      return
    }

    let postType = "STANDARD"
    const pt = pickField(row, "postType", mapping)
    if (typeof pt === "string" && pt.trim()) {
      const upper = pt.trim().toUpperCase()
      if (VALID_POST_TYPES.includes(upper)) postType = upper
    }

    const mediaUrl = pickField(row, "mediaUrl", mapping)
    const mediaUrls =
      typeof mediaUrl === "string" && mediaUrl.trim() ? [mediaUrl.trim()] : null

    let callToAction: { actionType: string; url?: string } | null = null
    const ctaTypeRaw = pickField(row, "ctaType", mapping)
    const ctaUrlRaw = pickField(row, "ctaUrl", mapping)
    if (typeof ctaTypeRaw === "string" && ctaTypeRaw.trim()) {
      const upper = ctaTypeRaw.trim().toUpperCase()
      if (VALID_CTA.includes(upper)) {
        callToAction = {
          actionType: upper,
          ...(typeof ctaUrlRaw === "string" && ctaUrlRaw.trim()
            ? { url: ctaUrlRaw.trim() }
            : {}),
        }
      }
    }

    toInsert.push({ locationName, scheduledFor, postType, summary, mediaUrls, callToAction })
  })

  let insertedCount = 0
  if (toInsert.length > 0) {
    const result = await db
      .insert(scheduledPosts)
      .values(
        toInsert.map((row) => ({
          locationName: row.locationName,
          scheduledFor: row.scheduledFor,
          postType: row.postType,
          summary: row.summary,
          mediaUrls: row.mediaUrls,
          callToAction: row.callToAction,
          status: "pending",
        }))
      )
      .returning({ id: scheduledPosts.id })
    insertedCount = result.length
  }

  return { success: true, totalRows: rows.length, inserted: insertedCount, errors }
}
