"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Star, Loader2, ThumbsUp, AlertTriangle, MessageSquare } from "lucide-react"
import { useGbp } from "@/lib/store"

interface Highlight {
  reviewName: string
  locationName: string
  storeName: string
  reviewer: string | null
  starRating: number | null
  comment: string | null
  createTime: string | null
  hasReply: boolean
}

interface Highlights {
  top: Highlight[]
  concerning: Highlight[]
  unreplied: Highlight[]
}

function formatDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("ja-JP")
}

function HighlightCard({ h, tone }: { h: Highlight; tone: "good" | "bad" | "neutral" }) {
  const toneClass =
    tone === "good"
      ? "border-l-4 border-l-green-500"
      : tone === "bad"
        ? "border-l-4 border-l-red-500"
        : "border-l-4 border-l-gray-300"
  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-medium bg-gray-100 px-2 py-0.5 rounded">
            {h.storeName}
          </span>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-3.5 w-3.5 ${
                  i < (h.starRating ?? 0)
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-gray-300"
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {h.reviewer ?? "匿名"} ・ {formatDate(h.createTime)}
          </span>
          {h.hasReply && (
            <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
              返信済み
            </span>
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap mt-2">{h.comment}</p>
      </CardContent>
    </Card>
  )
}

export default function ReviewHighlightsPage() {
  const { locationName } = useGbp()
  const [data, setData] = useState<Highlights | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<"store" | "all">("store")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (scope === "store" && locationName) {
        params.set("locationName", locationName)
      }
      const res = await fetch(`/api/reviews/highlights?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [scope, locationName])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">クチコミハイライト分析</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setScope("store")}
            disabled={!locationName}
            className={`px-3 py-1.5 text-xs rounded border ${
              scope === "store"
                ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                : "bg-white border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            }`}
          >
            選択店舗のみ
          </button>
          <button
            onClick={() => setScope("all")}
            className={`px-3 py-1.5 text-xs rounded border ${
              scope === "all"
                ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                : "bg-white border-gray-300 hover:bg-gray-50"
            }`}
          >
            全店舗集計
          </button>
        </div>
      </div>

      {scope === "store" && !locationName && (
        <Card className="mb-4 p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">
            店舗未選択。「全店舗集計」を選択するか、上部セレクタで店舗を選んでください。
          </p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> 分析中…
        </div>
      )}

      {error && (
        <Card className="mb-4 p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">エラー: {error}</p>
        </Card>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Top positive */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-green-600" />
              注目の高評価
              <span className="text-xs text-muted-foreground font-normal">
                ({data.top.length})
              </span>
            </h2>
            {data.top.length === 0 ? (
              <p className="text-sm text-muted-foreground">該当なし</p>
            ) : (
              data.top.map((h) => (
                <HighlightCard key={h.reviewName} h={h} tone="good" />
              ))
            )}
          </div>

          {/* Concerning */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              要対応（★1-2）
              <span className="text-xs text-muted-foreground font-normal">
                ({data.concerning.length})
              </span>
            </h2>
            {data.concerning.length === 0 ? (
              <p className="text-sm text-muted-foreground">該当なし</p>
            ) : (
              data.concerning.map((h) => (
                <HighlightCard key={h.reviewName} h={h} tone="bad" />
              ))
            )}
          </div>

          {/* Unreplied */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-600" />
              未返信（古い順）
              <span className="text-xs text-muted-foreground font-normal">
                ({data.unreplied.length})
              </span>
            </h2>
            {data.unreplied.length === 0 ? (
              <p className="text-sm text-muted-foreground">該当なし</p>
            ) : (
              data.unreplied.map((h) => (
                <HighlightCard key={h.reviewName} h={h} tone="neutral" />
              ))
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        ※ DB のクチコミアーカイブ (現存分のみ) から抽出しています。
      </p>
    </div>
  )
}
