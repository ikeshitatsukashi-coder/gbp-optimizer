"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Star, Search, Ban, Trash2, AlertCircle, CheckCircle2 } from "lucide-react"

interface Exclusion {
  id: number
  reviewName: string | null
  locationName: string
  storeName: string
  reviewerName: string | null
  createTime: string | null
  excludeAutoReply: boolean
  excludeAutoFlag: boolean
  reason: string | null
  createdAt: string
  reviewComment: string | null
  starRating: number | null
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("ja-JP")
}

export default function ExclusionsPage() {
  const [items, setItems] = useState<Exclusion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set("storeFilter", search.trim())
      const res = await fetch(`/api/reviews/exclusions?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setItems(j.exclusions)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    load()
  }, [load])

  const handleToggle = async (
    id: number,
    field: "excludeAutoReply" | "excludeAutoFlag",
    value: boolean
  ) => {
    try {
      const res = await fetch(`/api/reviews/exclusions?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      }
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleRemove = async (id: number) => {
    if (!confirm("除外設定を解除しますか？\n（このレビューは再び自動返信/削除申請の対象になります）")) {
      return
    }
    try {
      const res = await fetch(`/api/reviews/exclusions?id=${id}`, { method: "DELETE" })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      }
      setItems((prev) => prev.filter((it) => it.id !== id))
      setSuccess("除外設定を解除しました")
      setTimeout(() => setSuccess(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Ban className="h-6 w-6" />
          除外レビュー管理
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          自動返信・削除申請の対象から外したい個別レビューをここで管理します。「自動返信バッチ」「削除申請バッチ」で除外したレビューが一覧表示されます。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {success && (
        <Card className="p-4 bg-green-50 border-green-200 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
          <p className="text-sm text-green-800">{success}</p>
        </Card>
      )}

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="店舗名で検索"
            className="w-full h-8 pl-7 pr-2 text-sm border rounded bg-background"
          />
        </div>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
        </div>
      )}

      {!loading && items.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <Ban className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">除外設定なし</p>
          <p className="text-xs mt-1">
            「自動返信バッチ」「削除申請バッチ」のページで除外ボタンを押すと、ここに記録されます。
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {items.map((it) => (
          <Card key={it.id}>
            <div className="p-4">
              <div className="flex items-start gap-3 flex-wrap mb-2">
                <span className="text-sm font-medium">{it.storeName}</span>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${
                        i < (it.starRating ?? 0)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {it.reviewerName ?? "匿名"} ・ {formatDate(it.createTime)}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  除外登録: {formatDate(it.createdAt)}
                </span>
              </div>

              {it.reviewComment && (
                <div className="bg-gray-50 rounded p-3 text-sm mb-3 whitespace-pre-wrap">
                  {it.reviewComment}
                </div>
              )}

              {it.reason && (
                <div className="text-xs text-muted-foreground mb-3">
                  理由: {it.reason}
                </div>
              )}

              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={it.excludeAutoReply}
                    onChange={(e) =>
                      handleToggle(it.id, "excludeAutoReply", e.target.checked)
                    }
                    className="h-4 w-4"
                  />
                  自動返信から除外
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={it.excludeAutoFlag}
                    onChange={(e) =>
                      handleToggle(it.id, "excludeAutoFlag", e.target.checked)
                    }
                    className="h-4 w-4"
                  />
                  削除申請から除外
                </label>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleRemove(it.id)}
                  className="ml-auto"
                >
                  <Trash2 className="h-3 w-3" />
                  除外解除
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
