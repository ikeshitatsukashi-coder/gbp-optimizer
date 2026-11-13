"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"

const KEY = "gbp-low-review-check-last"
/** 同じブラウザからは1時間に1回まで声をかける（サーバー側は全体で3時間おきにしか確認しない） */
const INTERVAL_MS = 60 * 60 * 1000

/**
 * 低評価クチコミの自動確認。ツールを開いている間に、裏で新着を確かめる。
 *
 * Google から読むだけで、何も書き換えない。見つけた低評価は
 * 「低評価クチコミのお知らせ」の画面に並び、設定があれば社内にメールが届く。
 * 結果は画面に出さない（失敗しても、いま開いている画面の操作には影響しない）。
 */
export function LowReviewCheckTrigger() {
  const { data: session } = useSession()

  useEffect(() => {
    if (!session) return
    try {
      const last = Number(localStorage.getItem(KEY) ?? 0)
      if (Date.now() - last < INTERVAL_MS) return
      localStorage.setItem(KEY, String(Date.now()))
    } catch {
      /* localStorage が使えなくても続行（サーバー側の3時間の間隔が歯止めになる） */
    }
    // 予約投稿の自動実行と時間をずらして、同時に走らないようにする
    const timer = setTimeout(() => {
      fetch("/api/review-notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", auto: true }),
      }).catch(() => {})
    }, 20_000)
    return () => clearTimeout(timer)
  }, [session])

  return null
}
