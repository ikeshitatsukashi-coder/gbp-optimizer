"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { X, Search, Loader2, ImageIcon, Cloud } from "lucide-react"

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
  locationName: string | null
  onSelect: (url: string) => void
}

/**
 * 画像を選ぶモーダル。 reference (meo-dash) の 2 タブ UI にビジュアル寄せ。
 * - タブ1: 画像をアップロード（drag&drop + ファイル選択）
 * - タブ2: 画像ライブラリ（既存写真グリッド）
 */
export function ImageLibraryModal({ isOpen, onClose, locationName, onSelect }: Props) {
  const [tab, setTab] = useState<"upload" | "library">("upload")
  const [inputUrl, setInputUrl] = useState("")
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      setMedia(Array.isArray(j.mediaItems) ? j.mediaItems : [])
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

  const handleUrlPick = () => {
    const u = inputUrl.trim()
    if (!u) return
    onSelect(u)
    setInputUrl("")
    onClose()
  }

  const handleFilesDropped = (files: FileList | null) => {
    if (!files || files.length === 0) return
    // ローカル file → BlobURL でプレビュー用 URL を作成
    // 実 GBP に送信するには公開 URL が必要（現状のスコープでは案内のみ）
    const first = files[0]
    if (!first.type.startsWith("image/")) {
      setError("画像ファイルを選択してください")
      return
    }
    // ObjectURL は browser メモリ内のみ有効。GBP に送信するには公開 URL が要る旨案内。
    const blobUrl = URL.createObjectURL(first)
    onSelect(blobUrl)
    onClose()
  }

  const handleLibraryPick = (item: MediaItem) => {
    const url = item.googleUrl || item.sourceUrl || item.thumbnailUrl
    if (url) {
      onSelect(url)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10"
          aria-label="閉じる"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Tabs */}
        <div className="px-6 pt-6 pb-2 border-b border-gray-200">
          <div className="flex gap-6">
            {(
              [
                { key: "upload", label: "画像をアップロード" },
                { key: "library", label: "画像ライブラリ" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`pb-3 text-[15px] font-medium border-b-2 -mb-[9px] transition-colors ${
                  tab === t.key
                    ? "border-[#4a90e2] text-[#4a90e2]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "upload" ? (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  handleFilesDropped(e.dataTransfer.files)
                }}
                className={`border-2 border-dashed rounded-lg py-14 px-6 text-center transition-colors ${
                  dragOver
                    ? "border-[#4a90e2] bg-blue-50"
                    : "border-gray-300 bg-gray-50/50 hover:bg-gray-50"
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded bg-blue-100 flex items-center justify-center">
                    <Cloud className="h-8 w-8 text-[#4a90e2]" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm text-gray-700 font-medium">
                    ファイルをドラッグ&ドロップ
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm text-[#4a90e2] border border-[#4a90e2] rounded px-4 py-2 hover:bg-blue-50"
                  >
                    ファイルを選択...
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFilesDropped(e.target.files)}
                  />
                  <p className="text-xs text-gray-500">
                    ファイル追加(Shiftキーを押しながらファイルを複数選択可能)
                  </p>
                </div>
              </div>

              {/* URL 入力（Vercel Blob 直アップロード対応前の一時措置） */}
              <div className="border rounded p-4 bg-white">
                <p className="text-xs text-gray-500 mb-2">
                  または、公開URLを直接指定して選択:
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUrlPick()}
                    placeholder="https://example.com/photo.jpg"
                    className="flex-1 h-9 px-3 text-sm border rounded"
                  />
                  <button
                    onClick={handleUrlPick}
                    disabled={!inputUrl.trim()}
                    className="text-sm text-white bg-[#4a90e2] disabled:opacity-40 rounded px-4 hover:bg-[#3a7cc8]"
                  >
                    選択
                  </button>
                </div>
              </div>

              {/* Size recommendations */}
              <div className="bg-gray-50 border border-gray-200 rounded p-4 text-sm">
                <p className="font-medium mb-2">画像の推奨サイズ</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>
                    <p className="font-medium text-gray-700">Google、Facebook、Twitter</p>
                    <p>1200×900 以上（4:3 比推奨）</p>
                    <p>正方形の場合 720×720 以上</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Instagram</p>
                    <p>1080×1080（正方形）</p>
                    <p>ファイル形式: JPG / PNG / WEBP</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded p-3">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Search */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-9 px-3 text-sm border rounded"
                    placeholder=""
                  />
                </div>
                <button className="text-sm text-white bg-[#4a90e2] rounded px-4 hover:bg-[#3a7cc8]">
                  <Search className="h-3.5 w-3.5 inline mr-1" />
                  検索
                </button>
              </div>

              {!locationName && (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
                  店舗が未選択です。フォーム内の店舗を先に選択してください。
                </div>
              )}

              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
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

              {/* Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filtered.map((m) => {
                  const src = m.thumbnailUrl || m.googleUrl || m.sourceUrl
                  const label = m.name ? m.name.split("/").pop() : ""
                  return (
                    <button
                      key={m.name}
                      onClick={() => handleLibraryPick(m)}
                      className="text-left border rounded overflow-hidden hover:shadow-md hover:border-[#4a90e2] transition-all"
                    >
                      <div className="aspect-square bg-gray-100 relative">
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-gray-400 m-auto absolute inset-0" />
                        )}
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="text-xs font-medium truncate">
                          {label ?? "IMG"}
                        </p>
                        <p className="text-xs text-gray-500">
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
