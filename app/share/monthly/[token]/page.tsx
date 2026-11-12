"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { MonthlyReportView } from "@/components/reports/monthly-report-view"
import type { MonthlyReportData } from "@/lib/monthly-report-types"

/**
 * 月次レポートのお客様用ページ（ログイン不要・URLが鍵・見るだけ）。
 * 数字は発行した時点で保存したもの。
 */
export default function MonthlyReportSharePage() {
  const params = useParams<{ token: string }>()
  const [data, setData] = useState<MonthlyReportData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!params.token) return
    fetch(`/api/public/monthly/${params.token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        setData((await r.json()).report)
      })
      .catch(() => setError(true))
  }, [params.token])

  if (error) {
    return (
      <div className="mr-msg">
        このページは表示できません。
        <small>URLが変わったか、公開が終わっている可能性があります。担当者までお問い合わせください。</small>
      </div>
    )
  }
  if (!data) return <div className="mr-msg">読み込んでいます…</div>

  return (
    <>
      <div className="mr-tool mr-noprint">
        <span className="grow">
          {data.storeTitle}　{Number(data.month.slice(5, 7))}月のレポート
        </span>
        <button type="button" className="is-main" onClick={() => window.print()}>
          PDFで保存・印刷
        </button>
      </div>
      <MonthlyReportView data={data} />
    </>
  )
}
