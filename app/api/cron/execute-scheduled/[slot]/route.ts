import { GET as runScheduled } from "../route"

/** 投稿実行に時間がかかるため延長（親の実行処理と同じ） */
export const maxDuration = 60

/**
 * GET /api/cron/execute-scheduled/<時刻の名前>
 *
 * Vercel の定時実行は「同じパスは1つしか登録できない」ため、
 * 実行する時刻ごとに別のパス（/9・/10・/12・/16）を用意している。
 * 中身は /api/cron/execute-scheduled と同じ（認証・実行の鍵・処理内容すべて共通）。
 */
export async function GET(request: Request) {
  return runScheduled(request)
}
