"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"

const KEY = "gbp-auto-exec-last"
const INTERVAL_MS = 10 * 60 * 1000 // 同一ブラウザからは最短10分間隔

/**
 * 期日到来分の予約投稿を「ツールを開いたタイミング」でも実行する補助トリガー。
 *
 * 定期実行（GitHub Actions）は無料枠だと 1〜4 時間ほど遅延することがあるため、
 * 誰かがツールを使っている間は最短10分間隔で自動的に消化されるようにする。
 * サーバー側は scheduled_for <= now() かつ pending のものだけを対象にするので、
 * 何度呼んでも二重投稿にはならない。
 */
export function AutoExecTrigger() {
  const { data: session } = useSession()

  useEffect(() => {
    if (!session) return
    try {
      const last = Number(localStorage.getItem(KEY) ?? 0)
      if (Date.now() - last < INTERVAL_MS) return
      localStorage.setItem(KEY, String(Date.now()))
    } catch {
      /* localStorage 不可でも続行 */
    }
    // 結果は画面に出さない（バックグラウンド消化）
    fetch("/api/cron/execute-scheduled", { method: "POST" }).catch(() => {})
  }, [session])

  return null
}
