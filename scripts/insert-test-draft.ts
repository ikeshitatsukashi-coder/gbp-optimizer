import { db } from "../lib/db"
import { sql } from "drizzle-orm"

async function main() {
  // アイ・リンクの locationName を取得
  const stores = await db.execute(sql`
    SELECT location_name, title FROM stores WHERE title LIKE '%アイ%リンク%' LIMIT 5
  `)
  const slist = Array.isArray(stores) ? stores : ((stores as { rows?: unknown[] }).rows ?? [])
  console.table(slist)
  if (slist.length === 0) {
    console.log("store not found")
    return
  }
  const store = slist[0] as { location_name: string; title: string }

  const inserted = await db.execute(sql`
    INSERT INTO scheduled_posts (location_name, scheduled_for, post_type, summary, status)
    VALUES (
      ${store.location_name},
      now() + interval '7 days',
      'STANDARD',
      '【テスト下書き】表示確認用のテストです。確認後削除してください。',
      'draft'
    )
    RETURNING id
  `)
  const ilist = Array.isArray(inserted) ? inserted : ((inserted as { rows?: unknown[] }).rows ?? [])
  console.log("inserted:", ilist)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
