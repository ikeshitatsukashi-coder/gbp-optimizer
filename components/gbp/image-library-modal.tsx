"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  X,
  Search,
  Loader2,
  ImageIcon,
  Cloud,
  CheckCircle2,
  Copy,
  Trash2,
} from "lucide-react"
import { resizeImageForGbp } from "@/lib/image-resize"
import { fetchJson } from "@/lib/fetch-json"

interface MediaItem {
  name?: string
  googleUrl?: string
  thumbnailUrl?: string
  sourceUrl?: string
  createTime?: string
  locationAssociation?: { category?: string }
}

interface ArchiveImage {
  url: string
  pathname: string
  size: number
  uploadedAt: string
}

interface UploadingFile {
  name: string
  status: "resizing" | "uploading" | "done" | "error"
  error?: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  locationName: string | null
  /** 選択された画像 URL 群を返す（manageモードでは不要） */
  onSelect?: (urls: string[]) => void
  /** 選択できる残り枚数（投稿の最大10枚制限を呼び出し側から伝える） */
  maxCount?: number
  /**
   * select: 投稿に添付する画像を選ぶ（既定）
   * manage: 画像アーカイブの閲覧・アップロード・URLコピー・削除
   */
  mode?: "select" | "manage"
}

type TabKey = "upload" | "archive" | "library"

/**
 * 画像モーダル。
 * - アップロード: ローカルファイルを自動リサイズして Vercel Blob に保存
 * - アーカイブ: アップロード済み画像の一覧（選択・URLコピー・削除）
 * - GBP上の写真: 店舗がGoogleに掲載済みの写真から選択
 */
export function ImageLibraryModal({
  isOpen,
  onClose,
  locationName,
  onSelect,
  maxCount = 10,
  mode = "select",
}: Props) {
  const [tab, setTab] = useState<TabKey>(mode === "manage" ? "archive" : "upload")
  const [inputUrl, setInputUrl] = useState("")
  const [media, setMedia] = useState<MediaItem[]>([])
  const [archive, setArchive] = useState<ArchiveImage[]>([])
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [uploads, setUploads] = useState<UploadingFile[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
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

  const fetchArchive = useCallback(async () => {
    setArchiveLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/upload")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setArchive(Array.isArray(j.images) ? j.images : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setArchiveLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen && tab === "library") fetchMedia()
    if (isOpen && tab === "archive") fetchArchive()
  }, [isOpen, tab, fetchMedia, fetchArchive])

  useEffect(() => {
    if (isOpen) {
      setUploads([])
      setSelected(new Set())
      setError(null)
      setTab(mode === "manage" ? "archive" : "upload")
    }
  }, [isOpen, mode])

  if (!isOpen) return null

  const filteredMedia = search.trim()
    ? media.filter((m) =>
        (m.name ?? "").toLowerCase().includes(search.trim().toLowerCase())
      )
    : media

  const filteredArchive = search.trim()
    ? archive.filter((a) =>
        a.pathname.toLowerCase().includes(search.trim().toLowerCase())
      )
    : archive

  const handleUrlPick = () => {
    const u = inputUrl.trim()
    if (!u || !onSelect) return
    onSelect([u])
    setInputUrl("")
    onClose()
  }

  /**
   * ローカルファイル群を リサイズ → アップロード。
   * selectモード: 完了後そのまま投稿に添付して閉じる
   * manageモード: アーカイブを更新してアーカイブタブへ
   */
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const list = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, mode === "manage" ? 30 : maxCount)
    if (list.length === 0) {
      setError("画像ファイルを選択してください")
      return
    }
    setError(null)
    setUploads(list.map((f) => ({ name: f.name, status: "resizing" as const })))

    const urls: string[] = []
    for (let i = 0; i < list.length; i++) {
      const file = list[i]
      try {
        const resized = await resizeImageForGbp(file)
        setUploads((prev) =>
          prev.map((u, idx) => (idx === i ? { ...u, status: "uploading" } : u))
        )
        const fd = new FormData()
        fd.append("file", new File([resized.blob], resized.fileName, { type: "image/jpeg" }))
        const { ok, data, error } = await fetchJson<{ url: string }>("/api/upload", {
          method: "POST",
          body: fd,
        })
        if (!ok || !data?.url) throw new Error(error ?? "アップロードに失敗しました")

        urls.push(data.url)
        setUploads((prev) =>
          prev.map((u, idx) => (idx === i ? { ...u, status: "done" } : u))
        )
      } catch (e) {
        setUploads((prev) =>
          prev.map((u, idx) =>
            idx === i
              ? {
                  ...u,
                  status: "error",
                  error: e instanceof Error ? e.message : String(e),
                }
              : u
          )
        )
      }
    }

    if (urls.length > 0) {
      if (mode === "manage" || !onSelect) {
        // アーカイブに反映して一覧タブへ
        await fetchArchive()
        setTab("archive")
      } else {
        onSelect(urls)
        if (urls.length === list.length) {
          setTimeout(() => onClose(), 400)
        }
      }
    }
  }

  const toggleSelect = (url: string | undefined) => {
    if (!url) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      // 管理モード（URLコピー用）は枚数無制限。投稿添付は maxCount まで
      else if (mode === "manage" || next.size < maxCount) next.add(url)
      return next
    })
  }

  const confirmPick = () => {
    if (selected.size === 0 || !onSelect) return
    onSelect(Array.from(selected))
    onClose()
  }

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 1800)
  }

  /**
   * 選択中の画像URLを改行区切りでまとめてコピー。
   * スプレッドシートの「画像」列にそのまま縦方向へ貼り付けられる。
   */
  const copySelectedUrls = async () => {
    const urls = [...selected]
    if (urls.length === 0) return
    await navigator.clipboard.writeText(urls.join("\n"))
    setCopiedUrl("__bulk__")
    setTimeout(() => setCopiedUrl(null), 2500)
  }

  const deleteArchiveImage = async (img: ArchiveImage) => {
    if (
      !confirm(
        "この画像をアーカイブから削除しますか？\n※予約中・投稿済みの投稿がこの画像を使っている場合、表示できなくなります。"
      )
    )
      return
    try {
      const res = await fetch(`/api/upload?url=${encodeURIComponent(img.url)}`, {
        method: "DELETE",
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setArchive((prev) => prev.filter((a) => a.url !== img.url))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const uploading = uploads.some((u) => u.status === "resizing" || u.status === "uploading")

  const tabs: { key: TabKey; label: string }[] =
    mode === "manage"
      ? [
          { key: "archive", label: "画像アーカイブ" },
          { key: "upload", label: "画像をアップロード" },
        ]
      : [
          { key: "upload", label: "画像をアップロード" },
          { key: "archive", label: "アップロード済みから選ぶ" },
          { key: "library", label: "GBP上の写真" },
        ]

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col relative">
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
            {tabs.map((t) => (
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
          {tab === "upload" && (
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
                  handleFiles(e.dataTransfer.files)
                }}
                className={`border-2 border-dashed rounded-lg py-12 px-6 text-center transition-colors ${
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
                    disabled={uploading}
                    className="text-sm text-[#4a90e2] border border-[#4a90e2] rounded px-4 py-2 hover:bg-blue-50 disabled:opacity-50"
                  >
                    ファイルを選択...
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                  <p className="text-xs text-gray-500">
                    {mode === "manage"
                      ? "複数選択可（一度に最大30枚）。アップロード後はアーカイブに保存され、投稿時にいつでも使えます。"
                      : `複数選択可（最大${maxCount}枚）。2540×1430px を超える画像は自動でリサイズされます。`}
                  </p>
                </div>
              </div>

              {/* Upload progress */}
              {uploads.length > 0 && (
                <div className="border rounded divide-y">
                  {uploads.map((u, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                      {u.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      ) : u.status === "error" ? (
                        <X className="h-4 w-4 text-red-500 shrink-0" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-[#4a90e2] shrink-0" />
                      )}
                      <span className="truncate flex-1">{u.name}</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {u.status === "resizing"
                          ? "リサイズ中…"
                          : u.status === "uploading"
                            ? "アップロード中…"
                            : u.status === "done"
                              ? "完了"
                              : u.error}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* URL 入力（selectモードのみの補助手段） */}
              {mode === "select" && (
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
              )}

              {error && (
                <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded p-3">
                  {error}
                </div>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded p-4 text-xs text-gray-600">
                <p className="font-medium text-gray-700 mb-1">自動リサイズについて</p>
                <p>
                  アップロード時に 2540×1430px に収まるよう自動縮小し、JPEG に変換します（縦横比は維持）。Google の投稿画像要件（250×250px 以上・10KB〜5MB）を満たさない小さすぎる画像はエラーになります。
                </p>
              </div>
            </div>
          )}

          {tab === "archive" && (
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-9 pl-8 pr-3 text-sm border rounded"
                    placeholder="ファイル名で絞り込み"
                  />
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  全 {archive.length} 枚
                </span>
              </div>

              {/* 一括コピー: スプレッドシートへ縦方向に貼り付ける用 */}
              <div className="flex items-center justify-between gap-3 bg-blue-50 border border-blue-100 rounded px-3 py-2 flex-wrap">
                <p className="text-xs text-blue-900">
                  {selected.size > 0 ? (
                    <>
                      <b>{selected.size} 枚</b>選択中 — まとめてコピーすると1行1URLで貼り付けられます
                    </>
                  ) : (
                    <>
                      画像をクリックして選択すると、複数のURLをまとめてコピーできます（スプレッドシートの「画像」列に縦方向で貼り付け可）
                    </>
                  )}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  {selected.size > 0 && (
                    <button
                      onClick={() => setSelected(new Set())}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      選択解除
                    </button>
                  )}
                  <button
                    onClick={copySelectedUrls}
                    disabled={selected.size === 0}
                    className={`text-xs font-medium rounded px-3 py-1.5 flex items-center gap-1 ${
                      copiedUrl === "__bulk__"
                        ? "bg-green-600 text-white"
                        : "bg-[#4a90e2] text-white hover:bg-[#3a7cc8] disabled:opacity-40"
                    }`}
                  >
                    {copiedUrl === "__bulk__" ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> {selected.size}件コピーしました
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> 選択した{selected.size > 0 ? selected.size : ""}件のURLをコピー
                      </>
                    )}
                  </button>
                </div>
              </div>

              {archiveLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                  <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
                </div>
              )}

              {error && (
                <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded p-3">
                  {error}
                </div>
              )}

              {!archiveLoading && !error && filteredArchive.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">
                    アップロード済みの画像がまだありません。「画像をアップロード」タブから追加してください。
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredArchive.map((img) => {
                  const isPicked = selected.has(img.url)
                  const fileName = img.pathname.split("/").pop() ?? ""
                  // 先頭のタイムスタンプを除いた表示名
                  const displayName = fileName.replace(/^\d{13}-/, "")
                  return (
                    <div
                      key={img.url}
                      className={`text-left border rounded overflow-hidden transition-all relative group ${
                        isPicked
                          ? "border-[#4a90e2] ring-2 ring-[#4a90e2]/40 shadow"
                          : "hover:shadow-md hover:border-[#4a90e2]"
                      }`}
                    >
                      <button
                        onClick={() => toggleSelect(img.url)}
                        className="block w-full cursor-pointer"
                        title={
                          mode === "select"
                            ? "クリックで選択"
                            : "クリックで選択（複数選べば一括コピーできます）"
                        }
                      >
                        <div className="aspect-square bg-gray-100 relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.url}
                            alt={displayName}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                          {isPicked && (
                            <div className="absolute top-1 right-1 bg-[#4a90e2] rounded-full p-0.5">
                              <CheckCircle2 className="h-4 w-4 text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                      <div className="px-2 py-1.5">
                        <p className="text-xs font-medium truncate" title={displayName}>
                          {displayName}
                        </p>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-[11px] text-gray-500">
                            {new Date(img.uploadedAt).toLocaleDateString("ja-JP")}・
                            {Math.round(img.size / 1024)}KB
                          </p>
                          <button
                            onClick={() => deleteArchiveImage(img)}
                            className="text-gray-400 hover:text-red-500 shrink-0"
                            title="この画像を削除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {/* URLコピー: スプレッドシートの「画像」列に貼るための主要操作 */}
                        <button
                          onClick={() => copyUrl(img.url)}
                          className={`mt-1.5 w-full flex items-center justify-center gap-1 text-xs font-medium rounded py-1.5 border transition-colors ${
                            copiedUrl === img.url
                              ? "bg-green-50 border-green-300 text-green-700"
                              : "bg-white border-[#4a90e2] text-[#4a90e2] hover:bg-blue-50"
                          }`}
                        >
                          {copiedUrl === img.url ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" /> コピーしました
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" /> URLをコピー
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab === "library" && (
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

              {!loading && !error && locationName && filteredMedia.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">画像がありません</p>
                </div>
              )}

              {/* Grid（複数選択） */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredMedia.map((m) => {
                  const src = m.thumbnailUrl || m.googleUrl || m.sourceUrl
                  const url = m.googleUrl || m.sourceUrl || m.thumbnailUrl
                  const label = m.name ? m.name.split("/").pop() : ""
                  const isPicked = url ? selected.has(url) : false
                  return (
                    <button
                      key={m.name}
                      onClick={() => toggleSelect(url)}
                      className={`text-left border rounded overflow-hidden transition-all relative ${
                        isPicked
                          ? "border-[#4a90e2] ring-2 ring-[#4a90e2]/40 shadow"
                          : "hover:shadow-md hover:border-[#4a90e2]"
                      }`}
                    >
                      <div className="aspect-square bg-gray-100 relative">
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-gray-400 m-auto absolute inset-0" />
                        )}
                        {isPicked && (
                          <div className="absolute top-1 right-1 bg-[#4a90e2] rounded-full p-0.5">
                            <CheckCircle2 className="h-4 w-4 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="text-xs font-medium truncate">{label ?? "IMG"}</p>
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

        {/* Footer（selectモード: アーカイブ/GBP写真からまとめて追加） */}
        {mode === "select" && (tab === "archive" || tab === "library") && (
          <div className="border-t px-6 py-3 flex items-center justify-between bg-gray-50">
            <span className="text-sm text-gray-600">
              {selected.size} / {maxCount} 枚選択中
            </span>
            <button
              onClick={confirmPick}
              disabled={selected.size === 0}
              className="text-sm text-white bg-[#4a90e2] hover:bg-[#3a7cc8] rounded px-6 py-2 disabled:opacity-40"
            >
              選択した画像を追加
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
