/**
 * 作業前のデータベースの控えを取る（読み取りのみ・DBは変更しない）。
 *
 * 使い方:
 *   npx tsx --env-file=.env.local scripts/backup-db.ts "<保存先フォルダ>"
 *
 * - 全テーブルを1テーブル1ファイルの JSON で書き出す
 * - 書き出した後にファイルを読み直し、DB上の行数と一致するか照合する
 * - 認証トークンなどの秘密の値は書き出さない（キー名と長さだけ残す）
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

/** 値をそのまま書き出さないテーブル（秘密を含むため） */
const SECRET_TABLES: Record<string, string[]> = {
  app_settings: ["value"],
  social_connections: ["access_token", "refresh_token", "credentials"],
  api_keys: ["key_hash", "key"],
}

function rowsOf(r: unknown): Record<string, unknown>[] {
  return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[]
}

async function main() {
  const outDir = process.argv[2]
  if (!outDir) {
    console.error("保存先フォルダを指定してください")
    process.exit(1)
  }
  mkdirSync(outDir, { recursive: true })

  const tables = rowsOf(
    await db.execute(
      sql.raw(
        `select tablename from pg_tables where schemaname='public' order by tablename`
      )
    )
  ).map((t) => String(t.tablename))

  const manifest: { table: string; rows: number; file: string; bytes: number }[] = []
  let mismatch = 0

  for (const table of tables) {
    const data = rowsOf(await db.execute(sql.raw(`select * from "${table}"`)))
    const masked = SECRET_TABLES[table]
    const safe = masked
      ? data.map((row) => {
          const copy: Record<string, unknown> = { ...row }
          for (const col of masked) {
            if (col in copy && copy[col] != null) {
              copy[col] = `（秘密のため未保存・${String(copy[col]).length}文字）`
            }
          }
          return copy
        })
      : data

    const file = `${table}.json`
    const path = join(outDir, file)
    const text = JSON.stringify(safe)
    writeFileSync(path, text)

    // 書けたかを読み直して確かめる
    const readBack = JSON.parse(readFileSync(path, "utf8")) as unknown[]
    const count = Number(
      rowsOf(await db.execute(sql.raw(`select count(*)::int as n from "${table}"`)))[0].n
    )
    const ok = readBack.length === count
    if (!ok) mismatch++
    manifest.push({ table, rows: readBack.length, file, bytes: Buffer.byteLength(text) })
    console.log(
      `${ok ? "OK  " : "不一致"} ${table.padEnd(24)} ${String(readBack.length).padStart(6)}行 / DB ${count}行`
    )
  }

  writeFileSync(
    join(outDir, "_manifest.json"),
    JSON.stringify(
      { takenAt: new Date().toISOString(), tables: manifest, mismatch },
      null,
      2
    )
  )
  const total = manifest.reduce((a, m) => a + m.rows, 0)
  const mb = (manifest.reduce((a, m) => a + m.bytes, 0) / 1024 / 1024).toFixed(1)
  console.log(`\n合計 ${tables.length}テーブル / ${total}行 / ${mb}MB  不一致 ${mismatch}件`)
  console.log(`保存先: ${outDir}`)
  if (mismatch > 0) process.exit(2)
}

main()
