import { db } from "@/lib/db"
import { stores, type NewStore } from "@/lib/db/schema"
import { createGbpClient } from "@/lib/gbp-client"
import { sql } from "drizzle-orm"

/**
 * Google API 上の Location オブジェクトの最小型
 * google-api-types に依存せずローカルで定義しておく
 */
interface GoogleLocation {
  name?: string | null // "locations/12345"
  title?: string | null
  storefrontAddress?: Record<string, unknown> | null
  phoneNumbers?: {
    primaryPhone?: string | null
    additionalPhones?: string[] | null
  } | null
  categories?: {
    primaryCategory?: {
      displayName?: string | null
      name?: string | null
    } | null
  } | null
  metadata?: {
    placeId?: string | null
    newReviewUri?: string | null
    /** オーナー確認（Voice of Merchant）が取れているか */
    hasVoiceOfMerchant?: boolean | null
    /** 重複リスティングの場合、本体側の location 名 */
    duplicateLocation?: string | null
  } | null
}

export interface SyncResult {
  accountsProcessed: number
  locationsFetched: number
  inserted: number
  updated: number
  /** オーナー確認が取れていない店舗数（metadata.hasVoiceOfMerchant === false） */
  unverified: number
  /** 重複リスティング数（metadata.duplicateLocation あり） */
  duplicates: number
  errors: { accountName: string; error: string }[]
  durationMs: number
}

/**
 * 全アカウント・全店舗を取得して stores テーブルに UPSERT する。
 *
 * 既存レコードがある場合: 業種 / ステータス / autoReply 等の社内設定は維持し、
 *                       Google 由来のフィールド（title, address, phone, category）のみ更新。
 * 新規レコードの場合:     industry='general_btoc', status='active' で作成（後でUIから業種変更）
 */
export async function syncAllStores(accessToken: string): Promise<SyncResult> {
  const startedAt = Date.now()
  const client = createGbpClient(accessToken)

  const accounts = await client.listAccounts()
  const result: SyncResult = {
    accountsProcessed: 0,
    locationsFetched: 0,
    inserted: 0,
    updated: 0,
    unverified: 0,
    duplicates: 0,
    errors: [],
    durationMs: 0,
  }

  for (const account of accounts) {
    const accountName = account.name ?? ""
    if (!accountName) continue

    try {
      const locations = (await client.listLocations(accountName)) as GoogleLocation[]
      result.accountsProcessed += 1
      result.locationsFetched += locations.length
      for (const l of locations) {
        if (l.metadata?.hasVoiceOfMerchant === false) result.unverified += 1
        if (l.metadata?.duplicateLocation) result.duplicates += 1
      }

      // バッチで UPSERT（PostgresのON CONFLICTを使用）
      // 1件ずつだと434店舗で遅いので、bulk insert with ON CONFLICT DO UPDATE
      if (locations.length === 0) continue

      const rows: NewStore[] = locations
        .filter((l) => !!l.name)
        .map((l) => ({
          locationName: l.name!.startsWith("locations/") ? l.name! : `locations/${l.name}`,
          accountName,
          title: l.title ?? "（無題）",
          address: l.storefrontAddress ?? null,
          primaryPhone: l.phoneNumbers?.primaryPhone ?? null,
          primaryCategory: l.categories?.primaryCategory?.displayName ?? null,
          placeId: l.metadata?.placeId ?? null,
          newReviewUri: l.metadata?.newReviewUri ?? null,
          // オーナー確認・重複の判定材料。Google が返さなかった場合は null（=不明）にして
          // 「未確認」と決めつけない（誤って全店舗が対象外になるのを防ぐ）
          hasVoiceOfMerchant:
            typeof l.metadata?.hasVoiceOfMerchant === "boolean"
              ? l.metadata.hasVoiceOfMerchant
              : null,
          duplicateOf: l.metadata?.duplicateLocation ?? null,
          lastSyncedAt: new Date(),
          // status/industry/autoReply/autoFlag は default を使う（新規時のみ）
        }))

      // Drizzle の bulk insert + onConflictDoUpdate
      // 既存行は社内設定（status/industry/autoReply/autoFlag/parentCompany/notes）を保持
      const ret = await db
        .insert(stores)
        .values(rows)
        .onConflictDoUpdate({
          target: stores.locationName,
          set: {
            accountName: sql`excluded.account_name`,
            title: sql`excluded.title`,
            address: sql`excluded.address`,
            primaryPhone: sql`excluded.primary_phone`,
            primaryCategory: sql`excluded.primary_category`,
            placeId: sql`excluded.place_id`,
            newReviewUri: sql`excluded.new_review_uri`,
            hasVoiceOfMerchant: sql`excluded.has_voice_of_merchant`,
            duplicateOf: sql`excluded.duplicate_of`,
            lastSyncedAt: sql`excluded.last_synced_at`,
            updatedAt: sql`now()`,
            // status / industry / auto_reply_enabled / auto_flag_enabled / parent_company / notes は据え置き
          },
        })
        .returning({
          locationName: stores.locationName,
          createdAt: stores.createdAt,
          updatedAt: stores.updatedAt,
        })

      for (const r of ret) {
        // createdAt と updatedAt が同じ（誤差 100ms 以内）なら inserted、それ以上離れていれば updated
        const created = new Date(r.createdAt).getTime()
        const updated = new Date(r.updatedAt).getTime()
        if (Math.abs(updated - created) < 200) {
          result.inserted += 1
        } else {
          result.updated += 1
        }
      }
    } catch (e) {
      result.errors.push({
        accountName,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  result.durationMs = Date.now() - startedAt
  return result
}
