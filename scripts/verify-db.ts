import { db } from "../lib/db"
import { sql } from "drizzle-orm"
import { industryDefaults } from "../lib/db/schema"

async function main() {
  // 1. List tables
  const tables = await db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  )
  console.log("Tables:")
  for (const row of tables.rows ?? tables) {
    console.log("  -", (row as { table_name: string }).table_name)
  }

  // 2. Industry defaults count
  const rows = await db
    .select({
      industry: industryDefaults.industry,
      allowEmoji: industryDefaults.allowEmoji,
      banKundCustomer: industryDefaults.banKundCustomer,
    })
    .from(industryDefaults)
  console.log(`\nindustry_defaults rows: ${rows.length}`)
  console.table(rows)
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
