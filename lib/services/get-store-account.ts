import { db } from "@/lib/db"
import { stores } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * locationName から DB の stores テーブルを引き、対応する accountName を返す。
 * v4 API は accounts/{id}/locations/{id}/... の path を要求するため、
 * locationName 単体では呼び出しできず account 情報が必要。
 */
export async function getAccountNameForLocation(
  locationName: string
): Promise<string | null> {
  const fullName = locationName.startsWith("locations/")
    ? locationName
    : `locations/${locationName}`

  const [row] = await db
    .select({ accountName: stores.accountName })
    .from(stores)
    .where(eq(stores.locationName, fullName))

  return row?.accountName ?? null
}
