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
  // GMOエクスポート形式: 日付と時間が別列
  予約投稿日: "scheduledDate",
  投稿日: "scheduledDate",
  日付: "scheduledDate",
  予約投稿時間: "scheduledTime",
  投稿時間: "scheduledTime",
  時間: "scheduledTime",
  即時投稿: "immediateFlag",
  下書き保存: "draftFlag",
  下書き: "draftFlag",
  summary: "summary",
  本文: "summary",
  投稿内容: "summary",
  内容: "summary",
  投稿内容2: "summary2",
  投稿内容２: "summary2",
  ハッシュタグ: "hashtags",
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
  ボタンの追加: "ctaType",
  ctaurl: "ctaUrl",
  cta_url: "ctaUrl",
  ctaリンク: "ctaUrl",
  ボタンurl: "ctaUrl",
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
/** タイムゾーンなしの日時を日本時間(JST)として Date を作る（サーバーはUTCのため必須） */
function jstDate(y: number, mo: number, d: number, h = 0, mi = 0): Date | null {
  const date = new Date(Date.UTC(y, mo - 1, d, h - 9, mi))
  return isNaN(date.getTime()) ? null : date
}

function parseDateFlexible(raw: unknown): Date | null {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw

  // Excel シリアル値（1900/1/1 起点・シート上の時刻はJSTの壁時計とみなす）
  if (typeof raw === "number" && raw > 0 && raw < 100000) {
    const ms = Math.round((raw - 25569) * 86400 * 1000) - 9 * 3600 * 1000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }

  if (typeof raw !== "string") return null
  let s = raw.trim()
  if (!s) return null

  // 全角数字・コロンを半角へ
  s = s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ":")

  // タイムゾーン付きISO（Z / +09:00 等）はそのまま
  if (/\d(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }

  // 和暦風「2026年7月15日 10時30分」
  const jp = s.match(
    /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?\s*(?:(\d{1,2})時\s*(?:(\d{1,2})分?)?)?/
  )
  if (jp) {
    const [, y, mo, da, hh = "0", mi = "0"] = jp
    return jstDate(Number(y), Number(mo), Number(da), Number(hh), Number(mi))
  }

  // "2026-07-15 10:00" / "2026/7/15" / "2026.07.15T09:00"（年が先頭）
  const ymd = s.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/
  )
  if (ymd) {
    const [, y, mo, da, hh = "0", mi = "0"] = ymd
    return jstDate(Number(y), Number(mo), Number(da), Number(hh), Number(mi))
  }

  // "5/26/2026 9:00" / "5/26/26 9:00"（GMOエクスポートの米国式 M/D/YYYY・M/D/YY）
  const mdy = s.match(
    /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T](\d{1,2}):(\d{1,2}))?/
  )
  if (mdy) {
    const [, mo, da, yRaw, hh = "0", mi = "0"] = mdy
    const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw)
    return jstDate(y, Number(mo), Number(da), Number(hh), Number(mi))
  }

  return null
}

/** 日本語の投稿タイプ → API値（GMOエクスポート対応） */
const POST_TYPE_JA: Record<string, string> = {
  最新情報: "STANDARD",
  通常: "STANDARD",
  スタンダード: "STANDARD",
  イベント: "EVENT",
  特典: "OFFER",
  クーポン: "OFFER",
  オファー: "OFFER",
  臨時情報: "ALERT",
  緊急: "ALERT",
}

/** 日本語のボタン種別 → CTA API値（GMOエクスポート対応） */
const CTA_JA: Record<string, string> = {
  詳細: "LEARN_MORE",
  詳しくはこちら: "LEARN_MORE",
  詳しく: "LEARN_MORE",
  予約: "BOOK",
  注文: "ORDER",
  オンライン注文: "ORDER",
  購入: "SHOP",
  登録: "SIGN_UP",
  申し込む: "SIGN_UP",
  電話: "CALL",
  今すぐ電話: "CALL",
}

/** ○/はい/TRUE などのフラグ判定 */
function isFlagged(v: unknown): boolean {
  if (typeof v !== "string") return false
  const s = v.trim().toLowerCase()
  return ["○", "◯", "〇", "はい", "yes", "true", "1"].includes(s)
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

  // 画像アーカイブ（ファイル名 → URL）: 画像列にファイル名が入っている行がある場合のみ取得
  const needsArchive = rows.some((row) => {
    const v = pickField(row, "mediaUrl", mapping)
    return typeof v === "string" && v.trim() && !v.trim().startsWith("http")
  })
  const sanitizeName = (name: string) =>
    name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase()
  const archiveIndex = new Map<string, string>()
  if (needsArchive && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list } = await import("@vercel/blob")
      let cursor: string | undefined
      do {
        const page = await list({ prefix: "post-images/", limit: 500, cursor })
        for (const b of page.blobs) {
          const base = (b.pathname.split("/").pop() ?? "").replace(/^\d{13}-/, "")
          archiveIndex.set(sanitizeName(base), b.url)
        }
        cursor = page.cursor ?? undefined
      } while (cursor && archiveIndex.size < 2000)
    } catch {
      /* アーカイブ取得失敗時はファイル名解決なしで続行 */
    }
  }

  const errors: Array<{ rowIndex: number; error: string; rowData: unknown }> = []
  const toInsert: Array<{
    locationName: string
    scheduledFor: Date
    postType: string
    summary: string
    mediaUrls: string[] | null
    callToAction: { actionType?: string; url?: string } | null
    status: string
  }> = []

  rows.forEach((row, idx) => {
    const rowIndex = idx + 2 // 1 = 見出し
    const locRaw = pickField(row, "locationName", mapping)
    const storeNameRaw = pickField(row, "storeName", mapping)
    const summaryRaw = pickField(row, "summary", mapping)

    // 空行（本文も店舗も無い）はスキップ
    const isEmptyRow =
      !String(locRaw ?? "").trim() &&
      !String(storeNameRaw ?? "").trim() &&
      !String(summaryRaw ?? "").trim()
    if (isEmptyRow) return

    const locationName = resolveLocation(locRaw, storeNameRaw)
    if (!locationName) {
      const shown =
        (typeof storeNameRaw === "string" && storeNameRaw.trim()) ||
        (typeof locRaw === "string" && locRaw.trim()) ||
        "（店舗名・店舗ID列が空）"
      errors.push({ rowIndex, error: `店舗が特定できません: 「${shown}」`, rowData: row })
      return
    }

    // 日時: 予約日時（1列） or 予約投稿日+予約投稿時間（2列） or 即時投稿○ → 今すぐ
    const dateRaw = pickField(row, "scheduledFor", mapping)
    const dateOnly = pickField(row, "scheduledDate", mapping)
    const timeOnly = pickField(row, "scheduledTime", mapping)
    const immediate = isFlagged(pickField(row, "immediateFlag", mapping))
    const isDraft = isFlagged(pickField(row, "draftFlag", mapping))

    let scheduledFor = parseDateFlexible(dateRaw)
    if (!scheduledFor && typeof dateOnly === "string" && dateOnly.trim()) {
      const combined =
        typeof timeOnly === "string" && timeOnly.trim()
          ? `${dateOnly.trim()} ${timeOnly.trim()}`
          : dateOnly.trim()
      scheduledFor = parseDateFlexible(combined)
    }
    if (!scheduledFor && (immediate || isDraft)) {
      scheduledFor = new Date() // 即時投稿/日時なし下書きは「今」で登録（実行は手動）
    }
    if (!scheduledFor) {
      const shownVal = [dateRaw, dateOnly, timeOnly]
        .filter((v) => typeof v === "string" && v.trim())
        .join(" ")
      errors.push({
        rowIndex,
        error: shownVal
          ? `予約日時を読み取れません: 「${shownVal}」`
          : "予約日時を読み取れません（日時列が空・未対応。即時投稿○も未設定）",
        rowData: row,
      })
      return
    }

    // 本文 = 投稿内容 + 投稿内容2 + ハッシュタグ
    let summary = typeof summaryRaw === "string" ? summaryRaw.trim() : ""
    const summary2 = pickField(row, "summary2", mapping)
    if (typeof summary2 === "string" && summary2.trim()) {
      summary = summary ? `${summary}\n\n${summary2.trim()}` : summary2.trim()
    }
    const hashtags = pickField(row, "hashtags", mapping)
    if (typeof hashtags === "string" && hashtags.trim()) {
      summary = summary ? `${summary}\n\n${hashtags.trim()}` : hashtags.trim()
    }
    if (!summary) {
      errors.push({ rowIndex, error: "本文が空です", rowData: row })
      return
    }
    summary = summary.slice(0, 1500)

    // 投稿タイプ（日本語対応: 最新情報→STANDARD 等）
    let postType = "STANDARD"
    const pt = pickField(row, "postType", mapping)
    if (typeof pt === "string" && pt.trim()) {
      const t = pt.trim()
      const upper = t.toUpperCase()
      if (VALID_POST_TYPES.includes(upper)) postType = upper
      else if (POST_TYPE_JA[t]) postType = POST_TYPE_JA[t]
    }

    // 画像: URL ならそのまま / ファイル名なら画像アーカイブから解決
    let mediaUrls: string[] | null = null
    const mediaRaw = pickField(row, "mediaUrl", mapping)
    if (typeof mediaRaw === "string" && mediaRaw.trim()) {
      const v = mediaRaw.trim()
      if (v.startsWith("http")) {
        mediaUrls = [v]
      } else {
        const hit = archiveIndex.get(sanitizeName(v))
        if (hit) {
          mediaUrls = [hit]
        } else {
          errors.push({
            rowIndex,
            error: `画像「${v}」が画像アーカイブにありません。投稿ページの「画像アーカイブ」から先にアップロードしてください（この行は取り込まれていません）`,
            rowData: row,
          })
          return
        }
      }
    }

    // CTA（日本語対応: 詳細→LEARN_MORE 等）
    let callToAction: { actionType: string; url?: string } | null = null
    const ctaTypeRaw = pickField(row, "ctaType", mapping)
    const ctaUrlRaw = pickField(row, "ctaUrl", mapping)
    if (typeof ctaTypeRaw === "string" && ctaTypeRaw.trim()) {
      const t = ctaTypeRaw.trim()
      const upper = t.toUpperCase()
      const action = VALID_CTA.includes(upper) ? upper : (CTA_JA[t] ?? null)
      if (action) {
        callToAction = {
          actionType: action,
          ...(typeof ctaUrlRaw === "string" && ctaUrlRaw.trim()
            ? { url: ctaUrlRaw.trim() }
            : {}),
        }
      }
    }

    toInsert.push({
      locationName,
      scheduledFor,
      postType,
      summary,
      mediaUrls,
      callToAction,
      status: isDraft ? "draft" : "pending",
    })
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
          status: row.status,
        }))
      )
      .returning({ id: scheduledPosts.id })
    insertedCount = result.length
  }

  return { success: true, totalRows: rows.length, inserted: insertedCount, errors }
}
