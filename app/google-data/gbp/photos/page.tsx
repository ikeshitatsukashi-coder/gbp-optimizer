"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, Loader2, ExternalLink, ImageIcon, X } from "lucide-react"
import { useGbp } from "@/lib/store"

interface MediaItem {
  name?: string
  mediaFormat?: string
  locationAssociation?: {
    category?: string
  }
  googleUrl?: string
  thumbnailUrl?: string
  sourceUrl?: string
  createTime?: string
  insights?: {
    viewCount?: string
  }
  description?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  CATEGORY_UNSPECIFIED: "未分類",
  COVER: "カバー",
  PROFILE: "プロフィール",
  LOGO: "ロゴ",
  EXTERIOR: "外観",
  INTERIOR: "内観",
  PRODUCT: "商品",
  AT_WORK: "現場",
  FOOD_AND_DRINK: "料理",
  MENU: "メニュー",
  COMMON_AREA: "共有エリア",
  ROOMS: "部屋",
  TEAMS: "スタッフ",
  ADDITIONAL: "その他",
}

const CATEGORY_OPTIONS = [
  "ADDITIONAL",
  "EXTERIOR",
  "INTERIOR",
  "PRODUCT",
  "AT_WORK",
  "FOOD_AND_DRINK",
  "MENU",
  "TEAMS",
] as const

function formatDate(iso?: string): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("ja-JP")
}

export default function PhotosPage() {
  const { locationName } = useGbp()
  const [photos, setPhotos] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [mediaUrl, setMediaUrl] = useState("")
  const [category, setCategory] = useState<string>("ADDITIONAL")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [filter, setFilter] = useState<string>("all")

  const fetchPhotos = useCallback(async () => {
    if (!locationName) {
      setPhotos([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/gbp/media?locationName=${encodeURIComponent(locationName)}`
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      const list = Array.isArray(j.mediaItems) ? j.mediaItems : []
      setPhotos(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhotos([])
    } finally {
      setLoading(false)
    }
  }, [locationName])

  useEffect(() => {
    fetchPhotos()
  }, [fetchPhotos])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!locationName || !mediaUrl.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch("/api/gbp/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationName,
          mediaFormat: "PHOTO",
          sourceUrl: mediaUrl.trim(),
          locationAssociation: { category },
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setShowModal(false)
      setMediaUrl("")
      setCategory("ADDITIONAL")
      await fetchPhotos()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const categoryCounts: Record<string, number> = {}
  for (const p of photos) {
    const k = p.locationAssociation?.category ?? "CATEGORY_UNSPECIFIED"
    categoryCounts[k] = (categoryCounts[k] ?? 0) + 1
  }
  const filtered =
    filter === "all"
      ? photos
      : photos.filter((p) => (p.locationAssociation?.category ?? "CATEGORY_UNSPECIFIED") === filter)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">写真管理</h1>
        <Button onClick={() => setShowModal(true)} disabled={!locationName}>
          <Upload className="h-4 w-4" /> 写真を追加
        </Button>
      </div>

      {!locationName && (
        <Card className="mb-4 p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">
            画面上部の店舗セレクタで店舗を選択してください。
          </p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> 写真を取得中…
        </div>
      )}

      {error && (
        <Card className="mb-4 p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">エラー: {error}</p>
        </Card>
      )}

      {/* カテゴリフィルタ */}
      {locationName && photos.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setFilter("all")}
            className={`text-xs px-3 py-1.5 rounded border ${
              filter === "all"
                ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                : "bg-white border-gray-300 hover:bg-gray-50"
            }`}
          >
            全て ({photos.length})
          </button>
          {Object.entries(categoryCounts).map(([k, count]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`text-xs px-3 py-1.5 rounded border ${
                filter === k
                  ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                  : "bg-white border-gray-300 hover:bg-gray-50"
              }`}
            >
              {CATEGORY_LABELS[k] ?? k} ({count})
            </button>
          ))}
        </div>
      )}

      {!loading && !error && locationName && filtered.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">写真がありません</p>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((photo) => {
          const src = photo.googleUrl || photo.thumbnailUrl || photo.sourceUrl
          const cat = photo.locationAssociation?.category ?? "CATEGORY_UNSPECIFIED"
          return (
            <Card key={photo.name} className="overflow-hidden">
              <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="h-12 w-12 text-gray-400" />
                )}
              </div>
              <CardContent className="p-3">
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                  {CATEGORY_LABELS[cat] ?? cat}
                </span>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>{formatDate(photo.createTime)}</span>
                  {photo.insights?.viewCount && (
                    <span>{Number(photo.insights.viewCount).toLocaleString()} 回</span>
                  )}
                </div>
                {photo.googleUrl && (
                  <a
                    href={photo.googleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-500 hover:underline mt-2 flex items-center gap-1"
                  >
                    元画像 <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* アップロードモーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold">写真を追加</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpload} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  画像 URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  required
                  placeholder="https://example.com/photo.jpg"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  公開アクセス可能な画像URLが必要です。ローカルアップロードは未対応。
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">カテゴリ</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm bg-white"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>

              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                  {submitError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  キャンセル
                </Button>
                <Button type="submit" disabled={submitting || !mediaUrl.trim()}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> アップロード中…
                    </>
                  ) : (
                    "追加する"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
