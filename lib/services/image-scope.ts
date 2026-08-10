import { db } from "@/lib/db"
import { companies, imageOwners, stores } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * 画像がどの会社のものかを判定するための共通ロジック。
 *
 * 画像の持ち主は2通りの持ち方がある:
 *   1. Blob のフォルダ    post-images/<会社コード or 店舗ID>/...
 *      → フォルダ導入後にアップロードされた画像
 *   2. image_owners テーブル
 *      → フォルダ導入前の画像。移動するとURLが変わり既存投稿の参照が切れるため、
 *        ファイルは動かさず「持ち主」だけを記録する
 *
 * どちらも無い画像は「共通」として全店舗から見える（従来どおりの扱い）。
 */

/** パスに使える値だけを許可する（想定外の値でパスを掘られないようにする） */
export function safeSegment(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.trim().replace(/^locations\//, "")
  return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null
}

/** blob のパスからフォルダ名を取り出す（直下ならnull＝共通） */
export function folderOfPath(pathname: string): string | null {
  const rest = pathname.replace(/^post-images\//, "")
  const i = rest.indexOf("/")
  return i > 0 ? rest.slice(0, i) : null
}

export interface StoreScope {
  /** locations/xxx 形式 */
  locationName: string | null
  /** 店舗IDのみ */
  locationId: string | null
  /** 所属会社のコード（未設定ならnull） */
  companyCode: string | null
  /** 新規アップロード先のフォルダ名（会社コード優先、無ければ店舗ID） */
  folder: string | null
}

/**
 * 店舗IDから、その店舗が属する会社とアップロード先フォルダを解決する。
 * 会社が紐づいていれば会社単位、未紐づけなら暫定で店舗単位になる。
 */
export async function resolveStoreScope(locationIdRaw: string | null): Promise<StoreScope> {
  const bare = safeSegment(locationIdRaw)
  if (!bare) {
    return { locationName: null, locationId: null, companyCode: null, folder: null }
  }
  const locationName = `locations/${bare}`
  try {
    const [row] = await db
      .select({ code: companies.code })
      .from(stores)
      .leftJoin(companies, eq(stores.companyId, companies.id))
      .where(eq(stores.locationName, locationName))
    const code = safeSegment(row?.code ?? null)
    return {
      locationName,
      locationId: bare,
      companyCode: code,
      folder: code ?? bare,
    }
  } catch {
    // 会社が引けない場合は店舗単位で扱う
    return { locationName, locationId: bare, companyCode: null, folder: bare }
  }
}

/** 画像URL → 持ち主の店舗 と その会社コード */
export interface OwnerInfo {
  locationName: string
  companyCode: string | null
}

export async function loadImageOwners(): Promise<Map<string, OwnerInfo>> {
  const rows = await db
    .select({
      url: imageOwners.url,
      locationName: imageOwners.locationName,
      companyCode: companies.code,
    })
    .from(imageOwners)
    .leftJoin(stores, eq(imageOwners.locationName, stores.locationName))
    .leftJoin(companies, eq(stores.companyId, companies.id))

  const map = new Map<string, OwnerInfo>()
  for (const r of rows) {
    map.set(r.url, { locationName: r.locationName, companyCode: r.companyCode ?? null })
  }
  return map
}

/**
 * この画像を、指定した店舗の画面に表示してよいか。
 *
 * 持ち主が分からない画像（フォルダ無し・登録無し）は従来どおり共通扱いで表示する。
 * 持ち主が分かっている画像は、同じ会社（会社未設定なら同じ店舗）のときだけ表示する。
 */
export function isVisibleToScope(
  scope: StoreScope,
  pathFolder: string | null,
  owner: OwnerInfo | undefined
): boolean {
  // 店舗を指定していない場合はすべて表示（管理用）
  if (!scope.locationId) return true

  if (pathFolder) return pathFolder === scope.folder

  if (owner) {
    if (owner.companyCode && scope.companyCode) {
      return owner.companyCode === scope.companyCode
    }
    return owner.locationName === scope.locationName
  }

  // 持ち主不明 = 共通
  return true
}

/** 画像の帰属状態（画面表示用） */
export function ownershipLabel(
  pathFolder: string | null,
  owner: OwnerInfo | undefined
): "company" | "store" | "shared" {
  if (pathFolder) return "company"
  if (owner) return owner.companyCode ? "company" : "store"
  return "shared"
}
