"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Loader2, Star, Search, Download } from "lucide-react"

interface SummaryRow {
  locationName: string
  storeName: string
  industry: string
  status: string
  total: number
  avgRating: number
  replied: number
  replyRate: number
  oneStar: number
  twoStar: number
  latestReview: string | null
}

const INDUSTRY_LABELS: Record<string, string> = {
  btob_logistics: "BtoB物流",
  bakery: "ベーカリー",
  funeral: "葬祭",
  restaurant: "飲食",
  construction: "建設・不動産",
  staffing: "人材派遣",
  buyback: "買取",
  general_btoc: "BtoC一般",
  general_btob: "BtoB一般",
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("ja-JP")
}

function exportCsv(rows: SummaryRow[]) {
  const header = [
    "店舗名",
    "業種",
    "クチコミ総数",
    "平均評価",
    "返信数",
    "返信率",
    "★1件数",
    "★2件数",
    "最新クチコミ",
  ]
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        `"${r.storeName.replace(/"/g, '""')}"`,
        INDUSTRY_LABELS[r.industry] ?? r.industry,
        r.total,
        r.avgRating.toFixed(2),
        r.replied,
        `${r.replyRate}%`,
        r.oneStar,
        r.twoStar,
        formatDate(r.latestReview),
      ].join(",")
    ),
  ]
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `review-summary-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReviewSummaryPage() {
  const [rows, setRows] = useState<SummaryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<keyof SummaryRow>("total")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/reviews/per-store-summary")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setRows(j.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim()
    const base = q
      ? rows.filter(
          (r) =>
            r.storeName.includes(q) ||
            (INDUSTRY_LABELS[r.industry] ?? r.industry).includes(q)
        )
      : rows
    return [...base].sort((a, b) => {
      const av = a[sortKey] as number | string | null
      const bv = b[sortKey] as number | string | null
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""))
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [rows, search, sortKey, sortDir])

  const totals = useMemo(() => {
    const total = filtered.reduce((s, r) => s + r.total, 0)
    const replied = filtered.reduce((s, r) => s + r.replied, 0)
    const weightedAvg =
      total > 0 ? filtered.reduce((s, r) => s + r.avgRating * r.total, 0) / total : 0
    return { total, replied, replyRate: total > 0 ? (replied / total) * 100 : 0, weightedAvg }
  }, [filtered])

  const toggleSort = (key: keyof SummaryRow) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">クチコミ評価要約</h1>
        <button
          onClick={() => exportCsv(filtered)}
          disabled={filtered.length === 0}
          className="text-sm flex items-center gap-1 px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> CSV ダウンロード
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> 集計中…
        </div>
      )}
      {error && (
        <Card className="mb-4 p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">エラー: {error}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">対象店舗</div>
          <div className="text-2xl font-bold mt-1">{filtered.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">全クチコミ</div>
          <div className="text-2xl font-bold mt-1">{totals.total.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">加重平均評価</div>
          <div className="text-2xl font-bold mt-1 flex items-center gap-1">
            <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            {totals.weightedAvg.toFixed(2)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">返信率</div>
          <div className="text-2xl font-bold mt-1">{totals.replyRate.toFixed(0)}%</div>
        </Card>
      </div>

      <Card className="mb-4 p-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="店舗名・業種で検索"
            className="w-full h-8 pl-7 pr-2 text-sm border rounded bg-background"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {[
                  { key: "storeName" as keyof SummaryRow, label: "店舗名" },
                  { key: "industry" as keyof SummaryRow, label: "業種" },
                  { key: "total" as keyof SummaryRow, label: "総数" },
                  { key: "avgRating" as keyof SummaryRow, label: "平均評価" },
                  { key: "replyRate" as keyof SummaryRow, label: "返信率" },
                  { key: "oneStar" as keyof SummaryRow, label: "★1" },
                  { key: "twoStar" as keyof SummaryRow, label: "★2" },
                  { key: "latestReview" as keyof SummaryRow, label: "最新" },
                ].map((c) => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className="text-left px-3 py-2 font-medium cursor-pointer hover:bg-muted whitespace-nowrap"
                  >
                    {c.label}
                    {sortKey === c.key && (
                      <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.locationName} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{r.storeName}</td>
                  <td className="px-3 py-2 text-xs">
                    {INDUSTRY_LABELS[r.industry] ?? r.industry}
                  </td>
                  <td className="px-3 py-2 text-right">{r.total.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      {r.avgRating.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{r.replyRate}%</td>
                  <td
                    className={`px-3 py-2 text-right ${r.oneStar > 0 ? "text-red-700 font-medium" : ""}`}
                  >
                    {r.oneStar}
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${r.twoStar > 0 ? "text-orange-700 font-medium" : ""}`}
                  >
                    {r.twoStar}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDate(r.latestReview)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && !loading && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            該当する店舗がありません
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground mt-3">
        ※ クチコミ取得未実施の店舗は総数 0 と表示されます。「低評価クチコミ削除申請」ページから「全店舗クチコミ取得」を実行してください。
      </p>
    </div>
  )
}
