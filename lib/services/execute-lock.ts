import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

/**
 * 予約投稿の実行が重ならないようにするための鍵。
 *
 * 実行のきっかけは複数ある（定時実行・画面を開いた時の自動実行・「今すぐ実行」ボタン）。
 * 2つが同じ瞬間に走ると、同じ予約を両方が拾って二重に投稿するおそれがあるため、
 * 先に鍵を取れた1つだけが実行し、他は何もせず終わる。
 *
 * 鍵は app_settings の1行で持つ（テーブルの追加・変更はしない）。
 * 実行が途中で落ちて鍵が残っても、90秒たてば次の実行が取り直せる
 * （実行時間の上限は60秒）。
 */
const LOCK_KEY = "execute_lock"

function rowCount(r: unknown): number {
  const rows = Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])
  return rows.length
}

/** 鍵を取る。取れたら true（＝この実行が進めてよい） */
export async function acquireExecuteLock(owner: string): Promise<boolean> {
  const r = await db.execute(sql`
    insert into app_settings (key, value, updated_by, updated_at)
    values (${LOCK_KEY}, ${owner}, 'system', now())
    on conflict (key) do update
      set value = excluded.value, updated_by = 'system', updated_at = now()
      where app_settings.updated_at < now() - interval '90 seconds'
    returning key
  `)
  return rowCount(r) > 0
}

/** 自分が取った鍵だけを返す（他の実行の鍵は消さない） */
export async function releaseExecuteLock(owner: string): Promise<void> {
  await db.execute(sql`
    delete from app_settings where key = ${LOCK_KEY} and value = ${owner}
  `)
}
