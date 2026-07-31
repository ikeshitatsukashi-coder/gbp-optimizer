"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, BarChart3 } from "lucide-react"
import { fetchJsonRetry } from "@/lib/fetch-json"

/**
 * GA4（サイト側）のデータ表示。
 * GBPのインサイト（Googleマップ上の動き）と並べて見るための最小セット。
 */

interface Props {
  locationId: string
  onError: (msg: string) => void
}

interface Ga4Report {
  property: string
  range: { startDate: string; endDate: string }
  summary: {
    activeUsers: number
    sessions: number
    pageViews: number
    avgSessionDurationSec: number
    bounceRatePct: number
  }
  channels: { channel: string; sessions: number; activeUsers: number }[]
}

const CHANNEL_LABELS: Record<string, string> = {
  "Organic Search": "自然検索",
  "Direct": "直接アクセス",
  "Paid Search": "検索広告",
  "Organic Social": "SNS",
  "Referral": "他サイトから",
  "Email": "メール",
  "Display": "ディスプレイ広告",
  "Organic Video": "動画",
  "Unassigned": "分類なし",
}

const RANGES = [
  { days: 7, label: "過去7日" },
  { days: 28, label: "過去28日" },
  { days: 90, label: "過去90日" },
]

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

export function Ga4Panel({ locationId, onError }: Props) {
  const [days, setDays] = useState(28)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<Ga4Report | null>(null)

  const load = async (d: number) => {
    setDays(d)
    setLoading(true)
    try {
      const r = await fetchJsonRetry<Ga4Report>(
        `/api/ga4/report?locationId=${encodeURIComponent(locationId)}&days=${d}`
      )
      if (!r.ok) throw new Error(r.error ?? "GA4データの取得に失敗しました")
      setReport(r.data as Ga4Report)
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  const maxSessions = Math.max(1, ...(report?.channels ?? []).map((c) => c.sessions))

  return (
    <div className="mt-4 border-t pt-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => load(r.days)}
            disabled={loading}
            className={`text-xs px-2.5 py-1 rounded border ${
              days === r.days && report
                ? "bg-gray-900 text-white border-gray-900"
                : "hover:bg-gray-50"
            }`}
          >
            {r.label}
          </button>
        ))}
        {!report && (
          <Button variant="outline" size="sm" onClick={() => load(days)} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> 取得中…
              </>
            ) : (
              <>
                <BarChart3 className="h-3.5 w-3.5" /> サイトのデータを取得
              </>
            )}
          </Button>
        )}
        {loading && report && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
        )}
      </div>

      {report && (
        <>
          <p className="text-xs text-gray-500">
            {report.range.startDate} 〜 {report.range.endDate}（{report.property}）
          </p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              { label: "ユーザー数", value: report.summary.activeUsers.toLocaleString() },
              { label: "セッション", value: report.summary.sessions.toLocaleString() },
              { label: "ページ表示", value: report.summary.pageViews.toLocaleString() },
              {
                label: "平均滞在",
                value: formatDuration(report.summary.avgSessionDurationSec),
              },
              { label: "直帰率", value: `${report.summary.bounceRatePct}%` },
            ].map((s) => (
              <div key={s.label} className="border rounded p-2.5">
                <p className="text-[11px] text-gray-500">{s.label}</p>
                <p className="text-lg font-bold">{s.value}</p>
              </div>
            ))}
          </div>

          {report.channels.length > 0 && (
            <div>
              <p className="text-sm font-bold mb-1.5">流入元</p>
              <div className="space-y-1">
                {report.channels.map((c) => (
                  <div key={c.channel} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 truncate">
                      {CHANNEL_LABELS[c.channel] ?? c.channel}
                    </span>
                    <span className="flex-1 bg-gray-100 rounded h-4 relative overflow-hidden">
                      <span
                        className="absolute inset-y-0 left-0 bg-blue-400 rounded"
                        style={{ width: `${(c.sessions / maxSessions) * 100}%` }}
                      />
                    </span>
                    <span className="w-20 text-right shrink-0 tabular-nums">
                      {c.sessions.toLocaleString()} セッション
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
