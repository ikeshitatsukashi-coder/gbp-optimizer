"use client"

import { useCallback, useEffect, useState } from "react"
import { X, Upload, Image as ImageIcon, Search, Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface MediaItem {
  name?: string
  googleUrl?: string
  thumbnailUrl?: string
  sourceUrl?: string
  createTime?: string
  locationAssociation?: { category?: string }
}

interface Props {
  isOpen: boolean
  onClose: () => void
  /** GBP location resource name to fetch media from (single store scope) */
  locationName: string | null
  /** Called when a URL is chosen (from upload input or from library click) */
  onSelect: (url: string) => void
}

/**
 * 画像を選ぶモーダル。
 * タブ A: URL 入力（現状はパブリック URL のみ、将来 Vercel Blob 直アップロード対応）
 * タブ B: 既存の店舗写真から選択（v4 media から取得）
 */
export function ImageLibraryModal({ isOpen, onClose, locationName, onSelect }: Props) {
  const [tab, setTab] = useState<"upload" | "library">("upload")
  const [inputUrl, setInputUrl] = useState("")
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const fetchMedia = useCallback(async () => {
    if (!locationName) {
      setMedia([])
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
      setMedia(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [locationName])

  useEffect(() => {
    if (isOpen && tab === "library") fetchMedia()
  }, [isOpen, tab, fetchMedia])

  if (!isOpen) return null

  const filtered = search.trim()
    ? media.filter((m) =>
        (m.name ?? "").toLowerCase().includes(search.trim().toLowerCase())
      )
    : media

  const handlePickUrl = () => {
    const u = inputUrl.trim()
    if (!u) return
    onSelect(u)
    setInputUrl("")
    onClose()
  }

  const handlePickLibrary = (item: MediaItem) => {
    const url = item.googleUrl || item.sourceUrl || item.thumbnailUrl
    if (!url) return
    onSelect(url)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold">画像を選択</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4">
          {(
            [
              { key: "upload", label: "画像をアップロード" },
              { key: "library", label: "画像ライブラリ" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px ${
                tab === t.key
                  ? "border-blue-500 text-blue-600 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "upload" ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-blue-300 bg-blue-50/50 rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 mx-auto mb-3 text-blue-400" />
                <p className="text-sm text-muted-foreground mb-3">
                  画像 URL を入力してください（現状はパブリック URL のみ対応）
                </p>
                <div className="max-w-md mx-auto flex gap-2">
                  <input
                    type="url"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handlePickUrl()}
                    placeholder="https://example.com/photo.jpg"
                    className="flex-1 h-9 px-3 text-sm border rounded"
                  />
                  <Button
                    onClick={handlePickUrl}
                    disabled={!inputUrl.trim()}
                    size="sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> 選択
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  ※ ローカルからのファイル直接アップロードは今後対応予定。現状は Google Drive・Dropbox
                  等の公開 URL、または画像 CDN の URL をご利用ください。
                </p>
              </div>

              <div className="bg-gray-50 rounded p-3">
                <h3 className="text-sm font-medium mb-2">画像の推奨サイズ</h3>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>Google Business Profile: 1200×900 以上（4:3 推奨）</li>
                  <li>正方形も可、720×720 以上推奨</li>
                  <li>ファイル形式: JPG / PNG / WEBP</li>
                  <li>ファイルサイズ: 10MB 以下</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="画像を検索（ID・カテゴリ等）"
                  className="w-full h-9 pl-8 pr-3 text-sm border rounded"
                />
              </div>

              {!locationName && (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
                  店舗が未選択です。ページ上部のセレクタで店舗を選んでください。
                </div>
              )}

              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
                </div>
              )}

              {error && (
                <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded p-3">
                  {error}
                </div>
              )}

              {!loading && !error && locationName && filtered.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">画像がありません</p>
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {filtered.map((m) => {
                  const src = m.thumbnailUrl || m.googleUrl || m.sourceUrl
                  const label = m.name ? m.name.split("/").pop() : ""
                  return (
                    <button
                      key={m.name}
                      onClick={() => handlePickLibrary(m)}
                      className="group border rounded overflow-hidden hover:border-blue-400 hover:shadow"
                    >
                      <div className="aspect-square bg-gray-100 relative">
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-gray-400 m-auto absolute inset-0" />
                        )}
                        <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/20 transition" />
                      </div>
                      <div className="px-2 py-1 text-left">
                        <p className="text-xs font-medium truncate">{label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {m.createTime
                            ? new Date(m.createTime).toLocaleDateString("ja-JP")
                            : ""}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
