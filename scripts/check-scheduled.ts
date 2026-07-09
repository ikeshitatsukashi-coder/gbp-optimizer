import { db } from "../lib/db"
import { sql } from "drizzle-orm"

async function main() {
  const rows = await db.execute(sql`
    SELECT p.id, p.location_name, s.title, p.scheduled_for, p.status,
           left(p.summary, 40) AS summary_head, p.created_at
    FROM scheduled_posts p
    LEFT JOIN stores s ON s.location_name = p.location_name
    ORDER BY p.created_at DESC
    LIMIT 30
  `)
  const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
  console.log(`scheduled_posts rows: ${list.length}`)
  console.table(list)

  const counts = await db.execute(sql`
    SELECT status, count(*)::int FROM scheduled_posts GROUP BY status
  `)
  const clist = Array.isArray(counts) ? counts : ((counts as { rows?: unknown[] }).rows ?? [])
  console.log("by status:")
  console.table(clist)
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
