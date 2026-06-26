"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import {
  Star,
  Loader2,
  Search,
  Trash2,
  Flag,
  Download,
} from "lucide-react"

interface DeletedReview {
  reviewName: string
  locationName: string
  storeName: string
  reviewer: string | null
  starRating: number | null
  comment: string | null
  createTime: string | null
  deletedDetectedAt: string | null
  lastFlaggedAt: string | null
  wasFlagged: boolean
}

interface Stats {
  total: number
  flaggedCount: number
  naturalCount: number
  storeCount: number
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("ja-JP")
}

function exportCsv(rows: DeletedReview[]) {
  const header = [
    "店舗名",
    "投稿者",
    "星評価",
    "投稿日",
    "削除検知日",
    "申請日",
    "申請経由削除",
    "クチコミ本文",
  ]
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        `"${r.storeName.replace(/"/g, '""')}"`,
        `"${(r.reviewer ?? "").replace(/"/g, '""')}"`,
        r.starRating ?? "",
        formatDate(r.createTime),
        formatDate(r.deletedDetectedAt),
        formatDate(r.lastFlaggedAt),
        r.wasFlagged ? "Yes" : "No",
        `"${(r.comment ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
      ].join(",")
    ),
  ]
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `deleted-reviews-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function DeletedReviewsPage() {
  const [reviews, setReviews] = useState<DeletedReview[]>([])
  const [stats, setStats] = useState<Stats>({
    total: 0,
    flaggedCount: 0,
    naturalCount: 0,
    storeCount: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "flagged" | "natural">("all")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set("storeFilter", search.trim())
      const res = await fetch(`/api/reviews/deleted?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setReviews(j.deleted)
      setStats({
        total: j.total,
        flaggedCount: j.flaggedCount,
        naturalCount: j.naturalCount,
        storeCount: j.storeCount,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    load()
  }, [load])

  const filtered = reviews.filter((r) => {
    if (filter === "flagged") return r.wasFlagged
    if (filter === "natural") return !r.wasFlagged
    return true
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trash2 className="h-6 w-6" />
          削除済みクチコミ アーカイブ
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Google から消えたクチコミの履歴。削除申請が通ったもの / 投稿者削除 / Google 判断による削除 を含みます。検知タイミングは「全店舗クチコミ取得」の実行時。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">削除済み合計</div>
          <div className="text-2xl font-bold mt-1">{stats.total.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">申請経由</div>
          <div className="text-2xl font-bold mt-1 text-green-700">
            {stats.flaggedCount.toLocaleString()}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">自然削除</div>
          <div className="text-2xl font-bold mt-1 text-gray-700">
            {stats.naturalCount.toLocaleString()}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">対象店舗</div>
          <div className="text-2xl font-bold mt-1">{stats.storeCount.toLocaleString()}</div>
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
          <div className="flex gap-2">
            {[
              { key: "all" as const, label: "全て" },
              { key: "flagged" as const, label: "申請経由" },
              { key: "natural" as const, label: "自然削除" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 text-xs rounded border ${
                  filter === f.key
                    ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                    : "bg-white border-gray-300 hover:bg-gray-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
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

      {!loading && filtered.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <Trash2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">削除済みクチコミがありません</p>
          <p className="text-xs mt-1">
            「全店舗クチコミ取得」を 2 回以上実行すると、2 回目以降に消えたクチコミがここに記録されます。
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {filtered.map((r) => (
          <Card key={r.reviewName} className={r.wasFlagged ? "border-l-4 border-l-green-500" : ""}>
            <div className="p-3">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <span className="text-sm font-medium">{r.storeName}</span>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${
                        i < (r.starRating ?? 0)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {r.reviewer ?? "匿名"}
                </span>
                {r.wasFlagged && (
                  <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 flex items-center gap-1">
                    <Flag className="h-3 w-3" />
                    申請経由 ({formatDate(r.lastFlaggedAt)})
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  検知: {formatDate(r.deletedDetectedAt)}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {r.comment}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                投稿日: {formatDate(r.createTime)}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        ※ 削除検知は「全店舗クチコミ取得」実行時に行われます。前回取得時に存在していて今回存在しないクチコミを「削除」と判定。
      </p>
    </div>
  )
}
