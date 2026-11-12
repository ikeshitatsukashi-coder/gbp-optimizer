"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { fetchJson } from "@/lib/fetch-json"
import { normalizeSearchText } from "@/lib/search-normalize"
import { currentMonth, shiftMonth } from "@/lib/monthly-report-types"
import { AlertCircle, ExternalLink, FileText, Loader2, Search } from "lucide-react"

/**
 * 月次レポート（店舗の一覧）。
 *
 * 店舗の行の「レポートを開く」を押すと、その店舗・その月のレポートが別タブで開く。
 * 開いた画面から、PDFで保存・お客様用URLの発行ができる。
 * この画面と「開く」操作は読み取りだけで、Google にもデータにも何も書き込まない。
 */

interface Row {
  locationName: string
  title: string
  postedInMonth: number
  lastPostedAt: string | null
  shareToken: string | null
  shareUpdatedAt: string | null
}
interface StoreHit {
  locationName: string
  title: string
}

function reportUrl(locationName: string, month: string) {
  return `/share/monthly/preview?loc=${encodeURIComponent(
    locationName.replace(/^locations\//, "")
  )}&month=${month}`
}

function fmt(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function MonthlyReportListPage() {
  // 月初は「先月分」を出すことが多いので、10日までは先月を初期値にする
  const [month, setMonth] = useState(() => {
    const cur = currentMonth()
    const day = new Date(Date.now() + 9 * 3600e3).getUTCDate()
    return day <= 10 ? shiftMonth(cur, -1) : cur
  })
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [otherQ, setOtherQ] = useState("")
  const [otherHits, setOtherHits] = useState<StoreHit[] | null>(null)
  const [otherLoading, setOtherLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const monthOptions = useMemo(() => {
    const cur = currentMonth()
    return Array.from({ length: 13 }, (_, i) => shiftMonth(cur, -i))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetchJson<{ stores: Row[] }>(`/api/reports/monthly?list=1&month=${month}`)
      if (!r.ok || !r.data) throw new Error(r.error ?? "読み込めませんでした")
      setRows(r.data.stores)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const key = normalizeSearchText(q)
    return key ? rows.filter((r) => normalizeSearchText(r.title).includes(key)) : rows
  }, [rows, q])

  const searchOthers = async () => {
    const key = otherQ.trim()
    if (!key) return
    setOtherLoading(true)
    const r = await fetchJson<{ stores: StoreHit[] }>(
      `/api/stores?status=active&scope=operational&limit=30&q=${encodeURIComponent(key)}`
    )
    setOtherHits(r.ok && r.data ? r.data.stores : [])
    setOtherLoading(false)
  }

  const copyShare = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/monthly/${token}`)
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      /* コピーできない環境では、レポートを開いた画面のURL表示を使う */
    }
  }

  const monthLabel = `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`
  const issued = rows.filter((r) => r.shareToken).length

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            月次レポート
          </h1>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            店舗ごとに、その月の投稿本数・追加した写真・表示回数・クチコミと評価の推移を1枚にまとめます。
            <br />
            「レポートを開く」で別タブに表示され、そこからPDF保存と、お客様に渡すURLの発行ができます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="mr-month">
            対象の月
          </label>
          <select
            id="mr-month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 px-2 text-sm border rounded bg-white"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m.slice(0, 4)}年{Number(m.slice(5, 7))}月
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            投稿を登録している店舗 <span className="font-bold">{rows.length}</span> 件 ／ {monthLabel}
            分のお客様用URL 発行済み <span className="font-bold">{issued}</span> 件
          </p>
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="店舗名で絞り込み"
              className="h-9 pl-8 pr-3 text-sm border rounded w-56"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          「このツールからの投稿」は、投稿スケジューラから公開した本数です。レポートの中の投稿本数は、Google
          に公開されている投稿をそのまま数えるので、ほかの方法で出した投稿も含まれます。
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 font-normal min-w-64">店舗名</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">
                  {monthLabel}・このツールからの投稿
                </th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">お客様用URL</th>
                <th className="px-3 py-2 font-normal w-40" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                    読み込んでいます…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    該当する店舗がありません
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((r) => (
                  <tr key={r.locationName} className="border-t">
                    <td className="px-3 py-2">{r.title}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.postedInMonth} 本</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.shareToken ? (
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-green-700">
                            発行済み（{fmt(r.shareUpdatedAt)} 時点）
                          </span>
                          <button
                            type="button"
                            onClick={() => copyShare(r.shareToken!)}
                            className="text-xs text-[#4a90e2] hover:underline"
                          >
                            {copied === r.shareToken ? "コピーしました" : "URLをコピー"}
                          </button>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">まだ発行していません</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <a href={reportUrl(r.locationName, month)} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline">
                          <ExternalLink className="h-3.5 w-3.5" />
                          レポートを開く
                        </Button>
                      </a>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-medium">上の一覧に無い店舗のレポートを出す</p>
        <p className="text-xs text-muted-foreground">
          投稿スケジューラに登録が無い店舗でも、レポートは出せます。店舗名で探してください。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={otherQ}
            onChange={(e) => setOtherQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchOthers()
            }}
            placeholder="店舗名の一部を入力"
            className="h-9 px-3 text-sm border rounded w-72"
          />
          <Button size="sm" variant="outline" onClick={searchOthers} disabled={otherLoading}>
            {otherLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            探す
          </Button>
        </div>
        {otherHits && otherHits.length === 0 && (
          <p className="text-sm text-muted-foreground">見つかりませんでした</p>
        )}
        {otherHits && otherHits.length > 0 && (
          <ul className="divide-y border rounded">
            {otherHits.map((s) => (
              <li key={s.locationName} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm">{s.title}</span>
                <a href={reportUrl(s.locationName, month)} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">
                    <ExternalLink className="h-3.5 w-3.5" />
                    レポートを開く
                  </Button>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
