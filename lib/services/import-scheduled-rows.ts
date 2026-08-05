import { db } from "@/lib/db"
import { companies, scheduledPosts, stores } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { normalizeCoreName, normalizeSearchText } from "@/lib/search-normalize"

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
  会社id: "companyCode",
  会社コード: "companyCode",
  companycode: "companyCode",
  company_code: "companyCode",
  companyid: "companyCode",
  店舗名: "storeName",
  店舗: "storeName",
  店名: "storeName",
  // 「会社名」はGMOのエクスポートで店舗名として使われているため storeName に寄せる
  // （会社の特定には上の「会社ID」列を使う）
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
    .select({
      locationName: stores.locationName,
      title: stores.title,
      companyCode: companies.code,
    })
    .from(stores)
    .leftJoin(companies, eq(stores.companyId, companies.id))
  // 同名の店舗が実在する（例: 「株式会社国商運輸 伊勢崎営業所」が2件）ため、
  // 店舗名は必ず配列で持ち、1件に絞れない場合は特定せずエラーにする。
  const byTitle = new Map<string, string[]>()
  for (const s of allStores) {
    const arr = byTitle.get(s.title)
    if (arr) arr.push(s.locationName)
    else byTitle.set(s.title, [s.locationName])
  }
  const validLocationNames = new Set(allStores.map((s) => s.locationName))
  // 店舗 → 会社コード（画像フォルダの判定に使う）
  const companyCodeByLocation = new Map<string, string>()
  // 会社コード（大文字小文字を無視） → その会社の店舗
  const storesByCompany = new Map<string, Set<string>>()
  for (const s of allStores) {
    if (!s.companyCode) continue
    companyCodeByLocation.set(s.locationName, s.companyCode)
    const k = s.companyCode.trim().toLowerCase()
    const set = storesByCompany.get(k) ?? new Set<string>()
    set.add(s.locationName)
    storesByCompany.set(k, set)
  }
  const byBareId = new Map(
    allStores.map((s) => [s.locationName.replace(/^locations\//, ""), s.locationName])
  )
  const byNormTitle = new Map<string, string[]>()
  // 法人格（株式会社・有限会社 等）の有無の違いを吸収するための索引。
  // GBP側で「北池 運送」→「有限会社北池運送」のように改称された場合に効く。
  const byCoreTitle = new Map<string, string[]>()
  for (const s of allStores) {
    const key = normalizeSearchText(s.title)
    const arr = byNormTitle.get(key)
    if (arr) arr.push(s.locationName)
    else byNormTitle.set(key, [s.locationName])

    const core = normalizeCoreName(s.title)
    if (core) {
      const carr = byCoreTitle.get(core)
      if (carr) carr.push(s.locationName)
      else byCoreTitle.set(core, [s.locationName])
    }
  }
  const titleOf = new Map(allStores.map((s) => [s.locationName, s.title]))

  /**
   * 行から店舗を特定する。
   * 店舗ID列があれば必ずそれを優先し、無い場合だけ店舗名で照合する。
   * 店舗名が複数店舗に一致する場合は「特定できた」とはみなさず候補を返す
   * （別会社の予約投稿として登録されるのを防ぐ）。
   */
  const resolveLocation = (
    locRaw: unknown,
    storeNameRaw: unknown,
    companyCodeRaw?: unknown
  ): {
    locationName: string | null
    ambiguous?: string[]
    unknownCompany?: string
    /** 一致しなかったが名前が近い店舗（エラー文で案内する） */
    near?: string[]
  } => {
    // 1) 店舗IDが指定されていれば最優先（同名でも確実に特定できる）
    if (typeof locRaw === "string" && locRaw.trim()) {
      const cleaned = locRaw.trim()
      const withPrefix = cleaned.startsWith("locations/")
        ? cleaned
        : `locations/${cleaned}`
      if (validLocationNames.has(withPrefix)) return { locationName: withPrefix }
      const bare = cleaned.replace(/^locations\//, "")
      if (byBareId.has(bare)) return { locationName: byBareId.get(bare)! }
    }
    // 2) 会社IDが指定されていれば、候補をその会社の店舗に絞る
    let scope: Set<string> | null = null
    if (typeof companyCodeRaw === "string" && companyCodeRaw.trim()) {
      const code = companyCodeRaw.trim().toLowerCase()
      const set = storesByCompany.get(code)
      if (!set) return { locationName: null, unknownCompany: companyCodeRaw.trim() }
      scope = set
    }
    const narrow = (arr: string[]): string[] => (scope ? arr.filter((n) => scope!.has(n)) : arr)

    // 3) 店舗名で照合（1件に絞れたときだけ採用）
    if (typeof storeNameRaw === "string" && storeNameRaw.trim()) {
      const name = storeNameRaw.trim()
      const exact = byTitle.get(name)
      if (exact) {
        const c = narrow(exact)
        if (c.length === 1) return { locationName: c[0] }
        if (c.length > 1) return { locationName: null, ambiguous: c }
      }
      const norm = normalizeSearchText(name)
      const hit = byNormTitle.get(norm)
      if (hit) {
        const c = narrow(hit)
        if (c.length === 1) return { locationName: c[0] }
        if (c.length > 1) return { locationName: null, ambiguous: c }
      }
      // 法人格の有無だけが違うケース（例: シート「有限会社北池運送」/ GBP「北池 運送」）
      const core = normalizeCoreName(name)
      const coreHit = core ? byCoreTitle.get(core) : undefined
      if (coreHit) {
        const c = narrow(coreHit)
        if (c.length === 1) return { locationName: c[0] }
        if (c.length > 1) return { locationName: null, ambiguous: c }
      }
      // どれにも当たらない場合は、近い店舗名を候補として返す（原因調査を助ける）
      const near = core
        ? allStores
            .filter((st) => {
              const stCore = normalizeCoreName(st.title)
              return (
                stCore.length > 1 && (stCore.includes(core) || core.includes(stCore))
              )
            })
            .slice(0, 3)
            .map((st) => st.locationName)
        : []
      return { locationName: null, near: near.length > 0 ? near : undefined }
    }

    // 4) 店舗名が無く、会社に店舗が1つだけならそれで確定できる
    if (scope && scope.size === 1) return { locationName: [...scope][0] }
    return { locationName: null }
  }

  // 画像アーカイブ（ファイル名 → URL）: 画像列にファイル名が入っている行がある場合のみ取得
  const needsArchive = rows.some((row) => {
    const v = pickField(row, "mediaUrl", mapping)
    return typeof v === "string" && v.trim() && !v.trim().startsWith("http")
  })
  const sanitizeName = (name: string) =>
    name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase()

  // 画像は店舗ごとのフォルダ（post-images/<店舗ID>/）に入っている。
  // 店舗をまたいで同じファイル名（例: gaiyou.jpg）が存在しうるため、
  // 必ず「その行の店舗のフォルダ」だけを参照する。
  const archiveByStore = new Map<string, Map<string, string>>()
  // 店舗フォルダ導入前にアップロードされた画像（post-images/直下）は共通として扱う
  const archiveShared = new Map<string, string>()
  let archiveCount = 0
  if (needsArchive && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list } = await import("@vercel/blob")
      let cursor: string | undefined
      do {
        const from: string | undefined = cursor
        const page = await list({ prefix: "post-images/", limit: 500, cursor: from })
        for (const b of page.blobs) {
          const rest = b.pathname.replace(/^post-images\//, "")
          const slash = rest.indexOf("/")
          const storeFolder = slash > 0 ? rest.slice(0, slash) : null
          const base = (rest.split("/").pop() ?? "").replace(/^\d{13}-/, "")
          const key = sanitizeName(base)
          if (storeFolder) {
            const m = archiveByStore.get(storeFolder) ?? new Map<string, string>()
            m.set(key, b.url)
            archiveByStore.set(storeFolder, m)
          } else {
            archiveShared.set(key, b.url)
          }
          archiveCount++
        }
        cursor = page.cursor ?? undefined
      } while (cursor && archiveCount < 2000)
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
    const companyCodeRaw = pickField(row, "companyCode", mapping)
    const summaryRaw = pickField(row, "summary", mapping)

    // 空行（本文も店舗も無い）はスキップ
    const isEmptyRow =
      !String(locRaw ?? "").trim() &&
      !String(storeNameRaw ?? "").trim() &&
      !String(companyCodeRaw ?? "").trim() &&
      !String(summaryRaw ?? "").trim()
    if (isEmptyRow) return

    const resolved = resolveLocation(locRaw, storeNameRaw, companyCodeRaw)
    const locationName = resolved.locationName
    if (!locationName) {
      const shown =
        (typeof storeNameRaw === "string" && storeNameRaw.trim()) ||
        (typeof locRaw === "string" && locRaw.trim()) ||
        "（店舗名・店舗ID列が空）"
      // 同名の店舗が複数ある場合は、どちらかに決め打ちせず店舗IDでの指定を促す
      const error = resolved.unknownCompany
        ? `会社ID「${resolved.unknownCompany}」が会社マスタにありません（管理設定→会社マスタで登録してください）`
        : resolved.ambiguous
          ? `店舗名「${shown}」に一致する店舗が${resolved.ambiguous.length}件あるため特定できません。` +
            `会社ID列または店舗ID列で指定してください（候補: ${resolved.ambiguous
              .map((n) => n.replace(/^locations\//, ""))
              .join(" / ")}）`
          : resolved.near
            ? `店舗が特定できません: 「${shown}」。似た店舗名があります → ${resolved.near
                .map((n) => `「${titleOf.get(n) ?? n}」(ID: ${n.replace(/^locations\//, "")})`)
                .join(" / ")}。GBP側で店舗名を変更した場合は、店舗マスタの「Googleから同期」を実行してください`
            : `店舗が特定できません: 「${shown}」（店舗マスタに該当する店舗名がありません。GBP側で改称した場合は「Googleから同期」を実行してください）`
      errors.push({ rowIndex, error, rowData: row })
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
        // 会社フォルダ → 店舗フォルダ → 共通 の順に探す（他社のフォルダは見ない）
        const bareId = locationName.replace(/^locations\//, "")
        const companyCode = companyCodeByLocation.get(locationName)
        const key = sanitizeName(v)
        const hit =
          (companyCode ? archiveByStore.get(companyCode)?.get(key) : undefined) ??
          archiveByStore.get(bareId)?.get(key) ??
          archiveShared.get(key)
        if (hit) {
          mediaUrls = [hit]
        } else {
          errors.push({
            rowIndex,
            error: `画像「${v}」がこの店舗の画像フォルダにありません。投稿ページで対象の店舗を選んだ状態で「画像アーカイブ」からアップロードしてください（この行は取り込まれていません）`,
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
