"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Star, Loader2, Search, History, Download, CheckCircle2 } from "lucide-react"

interface HistoryItem {
  id: number
  reviewName: string
  locationName: string
  storeName: string
  reviewer: string | null
  starRating: number | null
  comment: string | null
  status: string
  errorMessage: string | null
  flaggedAt: string
  confirmedAt: string | null
  currentArchiveReason: string | null
  wasDeleted: boolean
}

const STATUS_LABELS: Record<string, string> = {
  submitted: "送信成功",
  already_reported: "既報告",
  failed: "失敗",
  approved: "承認(削除済)",
  rejected: "却下",
}

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  already_reported: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-gray-100 text-gray-600",
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function exportCsv(rows: HistoryItem[]) {
  const header = [
    "申請日時",
    "店舗名",
    "投稿者",
    "星評価",
    "申請ステータス",
    "削除確認",
    "エラー",
    "クチコミ本文",
  ]
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        formatDate(r.flaggedAt),
        `"${r.storeName.replace(/"/g, '""')}"`,
        `"${(r.reviewer ?? "").replace(/"/g, '""')}"`,
        r.starRating ?? "",
        STATUS_LABELS[r.status] ?? r.status,
        r.wasDeleted ? "Yes" : "No",
        `"${(r.errorMessage ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
        `"${(r.comment ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
      ].join(",")
    ),
  ]
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `flag-history-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function FlagHistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [byStatus, setByStatus] = useState<Record<string, number>>({})
  const [deletedAfterFlag, setDeletedAfterFlag] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set("storeFilter", search.trim())
      if (statusFilter) params.set("status", statusFilter)
      const res = await fetch(`/api/reviews/flag-history?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setItems(j.history)
      setByStatus(j.byStatus ?? {})
      setDeletedAfterFlag(j.deletedAfterFlag ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6" />
          削除申請履歴
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          低評価クチコミ削除申請バッチで Google に送信した履歴。実際に削除された件数も追跡できます。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">申請総数</div>
          <div className="text-2xl font-bold mt-1">{items.length.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">送信成功</div>
          <div className="text-2xl font-bold mt-1 text-blue-700">
            {(byStatus.submitted ?? 0).toLocaleString()}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">既報告</div>
          <div className="text-2xl font-bold mt-1 text-yellow-700">
            {(byStatus.already_reported ?? 0).toLocaleString()}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">失敗</div>
          <div className="text-2xl font-bold mt-1 text-red-700">
            {(byStatus.failed ?? 0).toLocaleString()}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">削除確認済</div>
          <div className="text-2xl font-bold mt-1 text-green-700 flex items-center gap-1">
            <CheckCircle2 className="h-5 w-5" />
            {deletedAfterFlag.toLocaleString()}
          </div>
        </Card>
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="店舗名で検索"
              className="w-full h-8 pl-7 pr-2 text-sm border rounded bg-background"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2 text-sm border rounded bg-white"
          >
            <option value="">全ステータス</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            onClick={() => exportCsv(items)}
            disabled={items.length === 0}
            className="text-sm flex items-center gap-1 px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
        </div>
      )}

      {!loading && items.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">申請履歴がありません</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">申請日時</th>
                <th className="text-left px-3 py-2 font-medium">店舗</th>
                <th className="text-left px-3 py-2 font-medium">投稿者</th>
                <th className="text-left px-3 py-2 font-medium">★</th>
                <th className="text-left px-3 py-2 font-medium">ステータス</th>
                <th className="text-left px-3 py-2 font-medium">削除確認</th>
                <th className="text-left px-3 py-2 font-medium">クチコミ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {formatDate(it.flaggedAt)}
                  </td>
                  <td className="px-3 py-2 text-xs">{it.storeName}</td>
                  <td className="px-3 py-2 text-xs">{it.reviewer ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      {it.starRating ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[it.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {STATUS_LABELS[it.status] ?? it.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {it.wasDeleted ? (
                      <span className="text-xs text-green-700 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        削除済
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">未確認</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs max-w-md">
                    <div className="truncate" title={it.comment ?? ""}>
                      {it.comment}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        ※ 「削除確認」は「全店舗クチコミ取得」を実行して Google から該当レビューが消えていれば自動的に true になります。
      </p>
    </div>
  )
}
