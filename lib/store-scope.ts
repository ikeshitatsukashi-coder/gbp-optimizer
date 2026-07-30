import { and, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm"
import { stores } from "@/lib/db/schema"

/**
 * 店舗の取り込み範囲（GMOのツールに合わせた考え方）
 *
 * GMO側は「オーナー確認が済んでいないリスティングは取り込まない」ため、
 * 同じ会社のデータが重複しない。こちらは全件取り込むので、
 * 未確認リスティングや重複リスティングが混ざり、同じ会社が二重に見えてしまう。
 *
 * そこで「運用対象（operational）」という条件を1か所に定義して、
 * 店舗セレクタや各種バッチはこれを通すようにする。
 *
 * 重要: hasVoiceOfMerchant が null（=まだ同期していない/Googleが返さなかった）は
 * 「未確認」と決めつけず運用対象に含める。null を除外すると、
 * 店舗同期を実行するまで全店舗が消えてしまうため。
 */

export type StoreScope = "all" | "operational" | "unverified" | "duplicate"

export function isValidScope(v: string | null): v is StoreScope {
  return v === "all" || v === "operational" || v === "unverified" || v === "duplicate"
}

/** scope に対応する WHERE 条件（"all" は undefined） */
export function storeScopeCondition(scope: StoreScope): SQL | undefined {
  switch (scope) {
    case "operational":
      return and(
        // false のみ除外（null は含める）
        or(isNull(stores.hasVoiceOfMerchant), eq(stores.hasVoiceOfMerchant, true)),
        isNull(stores.duplicateOf)
      )
    case "unverified":
      return eq(stores.hasVoiceOfMerchant, false)
    case "duplicate":
      return isNotNull(stores.duplicateOf)
    default:
      return undefined
  }
}

/** 内訳のカウント（店舗マスタのフィルタ表示用） */
export const scopeCountsSql = {
  operational: sql<number>`count(*) filter (where (has_voice_of_merchant is null or has_voice_of_merchant = true) and duplicate_of is null)::int`,
  unverified: sql<number>`count(*) filter (where has_voice_of_merchant = false)::int`,
  duplicate: sql<number>`count(*) filter (where duplicate_of is not null)::int`,
  all: sql<number>`count(*)::int`,
}

/** 未確認・重複を除いた店舗だけを対象にする（バッチ用） */
export function operationalOnly(extra?: SQL | undefined): SQL | undefined {
  const base = storeScopeCondition("operational")
  if (!extra) return base
  return and(base, extra)
}

/** UI表示用のラベル */
export function storeScopeLabel(scope: StoreScope): string {
  return scope === "operational"
    ? "運用対象のみ"
    : scope === "unverified"
      ? "オーナー確認が必要"
      : scope === "duplicate"
        ? "重複リスティング"
        : "すべて"
}

/** 1店舗が運用対象かどうか（クライアント側の判定用） */
export function isOperational(store: {
  hasVoiceOfMerchant?: boolean | null
  duplicateOf?: string | null
}): boolean {
  if (store.duplicateOf) return false
  if (store.hasVoiceOfMerchant === false) return false
  return true
}
