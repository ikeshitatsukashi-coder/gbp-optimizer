import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"
import * as schema from "./schema"

/**
 * Vercel Postgres (Neon) HTTP driver
 * - Edge / Node どちらでも動作（WebSocket 不要）
 * - 並列クエリは可だがマルチステートメントなトランザクションは不可
 *   （バッチが必要な処理は db.transaction を使うか個別にまとめる）
 */
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Run `vercel env pull .env.local` after creating Postgres in Vercel Dashboard."
  )
}

const sql = neon(process.env.DATABASE_URL)

export const db = drizzle(sql, { schema, casing: "snake_case" })

export type DB = typeof db
export { schema }
