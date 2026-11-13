"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { MonthlyReportView } from "@/components/reports/monthly-report-view"
import {
  currentMonth,
  isReportableMonth,
  shiftMonth,
  type MonthlyReportData,
} from "@/lib/monthly-report-types"

/**
 * 月次レポートの確認画面（社内用）。
 * 開いた時点の数字を Google から読んで表示する。ここから PDF 保存と、お客様用URLの発行ができる。
 * サイドバーを出さず、お客様に渡る見た目そのままで確認できるようにしている（データの取得にはログインが要る）。
 */

const SECTION_LABEL: Record<string, string> = {
  posts: "投稿",
  photos: "写真",
  insights: "表示回数",
  reviews: "クチコミ",
  keywords: "検索された言葉",
}

function Preview() {
  const sp = useSearchParams()
  const router = useRouter()
  const loc = sp.get("loc") ?? ""
  const month = sp.get("month") ?? currentMonth()

  const [data, setData] = useState<MonthlyReportData | null>(null)
  const [share, setShare] = useState<{ token: string; updatedAt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const monthOptions = useMemo(() => {
    const cur = currentMonth()
    return Array.from({ length: 13 }, (_, i) => shiftMonth(cur, -i))
  }, [])

  const load = useCallback(async () => {
    setData(null)
    setError(null)
    setShare(null)
    if (!loc || !isReportableMonth(month)) {
      setError("店舗と月を選んでから開いてください。")
      return
    }
    try {
      const res = await fetch(
        `/api/reports/monthly?locationName=${encodeURIComponent(loc)}&month=${month}`
      )
      const j = await res.json().catch(() => ({}))
      if (res.status === 401) throw new Error("ログインしてから開いてください。")
      if (!res.ok) throw new Error(j.error || `読み込めませんでした（${res.status}）`)
      setData(j.report)
      setShare(j.share)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [loc, month])

  useEffect(() => {
    load()
  }, [load])

  const shareUrl = share ? `${window.location.origin}/share/monthly/${share.token}` : ""

  const issue = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/reports/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationName: loc, month }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `発行できませんでした（${res.status}）`)
      setShare({ token: j.token, updatedAt: j.updatedAt })
      setData(j.report)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* コピーできない環境では、表示されているURLを選択して使う */
    }
  }

  return (
    <>
      <div className="mr-tool mr-noprint">
        <a href="/reports/monthly">一覧へ戻る</a>
        <span className="grow">{data ? data.storeTitle : "月次レポート"}</span>
        <select
          value={month}
          aria-label="月を選ぶ"
          onChange={(e) =>
            router.replace(`/share/monthly/preview?loc=${encodeURIComponent(loc)}&month=${e.target.value}`)
          }
        >
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {m.slice(0, 4)}年{Number(m.slice(5, 7))}月
            </option>
          ))}
        </select>
        <button type="button" onClick={() => window.print()} disabled={!data}>
          PDFで保存・印刷
        </button>
        <button type="button" className="is-main" onClick={issue} disabled={!data || busy}>
          {busy ? "発行しています…" : share ? "お客様用URLを最新の数字で出し直す" : "お客様用URLを発行"}
        </button>
        {share && (
          <>
            <span className="url">{shareUrl}</span>
            <button type="button" onClick={copy}>
              {copied ? "コピーしました" : "URLをコピー"}
            </button>
            <span>
              お客様用URLの数字：
              {new Date(share.updatedAt).toLocaleString("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              時点
            </span>
          </>
        )}
      </div>

      {data && data.errors.length > 0 && (
        <div className="mr-warn mr-noprint">
          Google から読み取れなかった項目があります（
          {data.errors.map((e) => SECTION_LABEL[e.section] ?? e.section).join("・")}
          ）。その項目は空欄で表示しています。少し待ってから開き直してください。
        </div>
      )}

      {error ? (
        <div className="mr-msg">{error}</div>
      ) : !data ? (
        <div className="mr-msg">
          Google から数字を読み取っています…<small>数秒かかります。</small>
        </div>
      ) : (
        <MonthlyReportView data={data} />
      )}
    </>
  )
}

export default function MonthlyReportPreviewPage() {
  return (
    <Suspense fallback={<div className="mr-msg">読み込んでいます…</div>}>
      <Preview />
    </Suspense>
  )
}
