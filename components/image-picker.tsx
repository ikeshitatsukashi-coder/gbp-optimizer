"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Upload, X, ImageIcon, Check } from "lucide-react"

interface StoredImage {
  url: string
  pathname: string
  size: number
  uploadedAt: string
}

interface ImagePickerProps {
  open: boolean
  onClose: () => void
  /** 画像 URL を 1 枚選択したときに呼ばれる（親側で複数管理） */
  onSelect: (url: string) => void
  /** すでに選択済みの URL（チェックマーク表示用） */
  selected?: string[]
}

type Tab = "upload" | "library"

export function ImagePicker({ open, onClose, onSelect, selected = [] }: ImagePickerProps) {
  const [tab, setTab] = useState<Tab>("upload")
  const [images, setImages] = useState<StoredImage[]>([])
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadLibrary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/upload")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setConfigured(j.configured !== false)
      setImages(Array.isArray(j.images) ? j.images : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadLibrary()
      setTab("upload")
      setError(null)
    }
  }, [open, loadLibrary])

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return
      setUploading(true)
      setError(null)
      let lastUrl: string | null = null
      try {
        for (const file of list) {
          const form = new FormData()
          form.append("file", file)
          const res = await fetch("/api/upload", { method: "POST", body: form })
          const j = await res.json()
          if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
          lastUrl = j.url
          onSelect(j.url)
        }
        await loadLibrary()
        // 1 枚だけならそのまま閉じる
        if (list.length === 1 && lastUrl) onClose()
        else setTab("library")
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setUploading(false)
      }
    },
    [onSelect, loadLibrary, onClose]
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-end p-3 border-b">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 px-6 border-b">
          <button
            onClick={() => setTab("upload")}
            className={`py-3 text-sm font-medium border-b-2 -mb-px ${
              tab === "upload"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            画像をアップロード
          </button>
          <button
            onClick={() => setTab("library")}
            className={`py-3 text-sm font-medium border-b-2 -mb-px ${
              tab === "library"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            画像ライブラリ
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {!configured && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
              画像ストレージ（Vercel Blob）が未設定です。Vercel の Storage で Blob
              を作成し、BLOB_READ_WRITE_TOKEN を設定するとアップロードできます。
            </div>
          )}

          {tab === "upload" && (
            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files)
                }}
                className={`border-2 border-dashed rounded-lg py-16 flex flex-col items-center justify-center text-center transition-colors ${
                  dragOver ? "border-blue-400 bg-blue-50" : "border-blue-200 bg-blue-50/40"
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-10 w-10 text-blue-400 animate-spin mb-3" />
                    <p className="text-sm text-gray-600">アップロード中…</p>
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-12 w-12 text-blue-300 mb-3" />
                    <p className="text-sm text-gray-600 mb-3">
                      ファイルをドラッグ＆ドロップ
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-white border border-blue-300 text-blue-600 rounded px-4 py-2 text-sm hover:bg-blue-50"
                    >
                      <Upload className="h-4 w-4 inline mr-1" />
                      ファイルを選択…
                    </button>
                    <p className="text-xs text-gray-400 mt-3">
                      ファイル追加（複数選択可 / JPEG・PNG・WebP・GIF・上限10MB）
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) uploadFiles(e.target.files)
                    e.target.value = ""
                  }}
                />
              </div>
            </div>
          )}

          {tab === "library" && (
            <div>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
                </div>
              ) : images.length === 0 ? (
                <div className="text-center text-gray-400 py-12">
                  <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">アップロード済みの画像がありません</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {images.map((img) => {
                    const isSelected = selected.includes(img.url)
                    return (
                      <button
                        key={img.pathname}
                        onClick={() => onSelect(img.url)}
                        className={`relative rounded border overflow-hidden group aspect-square ${
                          isSelected ? "ring-2 ring-blue-500 border-blue-500" : "hover:border-blue-300"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        {isSelected && (
                          <span className="absolute top-1 right-1 bg-blue-500 text-white rounded-full p-0.5">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
