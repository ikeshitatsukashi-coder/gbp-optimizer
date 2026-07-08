"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Search,
  Upload,
  Download,
  Plus,
  ChevronDown,
  ChevronRight,
  Edit3,
  X,
  Loader2,
  Image as ImageIcon,
  Info,
} from "lucide-react"
import { useGbp } from "@/lib/store"
import { ImageLibraryModal } from "@/components/gbp/image-library-modal"

interface GbpPost {
  name: string
  summary?: string
  callToAction?: { actionType?: string; url?: string }
  media?: { sourceUrl?: string; googleUrl?: string }[]
  createTime?: string
  state?: string
  searchUrl?: string
  topicType?: string
}

interface ScheduledPost {
  id: number
  locationName: string
  storeName: string
  scheduledFor: string
  postType: string
  summary: string
  mediaUrls: string[] | null
  callToAction: { actionType?: string; url?: string } | null
  status: string
  executedAt: string | null
  errorMessage: string | null
  createdAt?: string
}

interface UnifiedRow {
  key: string
  source: "published" | "scheduled"
  no: number
  imageUrl: string | null
  postType: string
  title: string
  inputDate: string | null
  storeName: string
  scheduledFor: string | null
  startAt: string | null
  repeat: string
  nextRepeat: string | null
  status: string
  wfApproval: string
  summary: string
  cta: { actionType?: string; url?: string } | null
  searchUrl?: string
  scheduledId?: number
}

const POST_TYPE_LABELS: Record<string, string> = {
  STANDARD: "最新情報",
  EVENT: "イベント",
  OFFER: "特典",
  ALERT: "お知らせ",
}

const STATUS_LABELS: Record<string, string> = {
  LIVE: "投稿済",
  posted: "投稿済",
  pending: "予約中",
  failed: "失敗",
}

const STATUS_COLORS: Record<string, string> = {
  LIVE: "text-[#4a90e2]",
  posted: "text-[#4a90e2]",
  pending: "text-yellow-700",
  failed: "text-red-600",
}

const CTA_LABELS: Record<string, string> = {
  BOOK: "予約",
  ORDER: "注文",
  SHOP: "ショップ",
  LEARN_MORE: "詳細を見る",
  SIGN_UP: "登録",
  CALL: "電話",
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function extractTitle(summary: string, max = 30): string {
  const firstLine = summary.split("\n")[0] ?? ""
  return firstLine.length > max ? firstLine.slice(0, max) + "…" : firstLine
}

export default function PostsPage() {
  const { locationName, locations } = useGbp()
  const [published, setPublished] = useState<GbpPost[]>([])
  const [scheduled, setScheduled] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [pageSize, setPageSize] = useState(20)
  const [importDropdownOpen, setImportDropdownOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showNewModal, setShowNewModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadPublished = useCallback(async () => {
    if (!locationName) {
      setPublished([])
      return
    }
    const res = await fetch(
      `/api/gbp/posts?locationName=${encodeURIComponent(locationName)}`
    )
    const j = await res.json()
    if (res.ok) setPublished(Array.isArray(j.localPosts) ? j.localPosts : [])
  }, [locationName])

  const loadScheduled = useCallback(async () => {
    const url = locationName
      ? `/api/scheduled-posts?locationName=${encodeURIComponent(locationName)}`
      : `/api/scheduled-posts`
    const res = await fetch(url)
    const j = await res.json()
    if (res.ok) setScheduled(j.posts)
  }, [locationName])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadPublished(), loadScheduled()])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [loadPublished, loadScheduled])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const currentStoreTitle = useMemo(
    () => locations.find((l) => l.name === locationName)?.title ?? "",
    [locations, locationName]
  )

  const rows: UnifiedRow[] = useMemo(() => {
    const p: UnifiedRow[] = published.map((post, idx) => ({
      key: `p:${post.name}`,
      source: "published",
      no: idx + 1,
      imageUrl: post.media?.[0]?.googleUrl || post.media?.[0]?.sourceUrl || null,
      postType: post.topicType ?? "STANDARD",
      title: extractTitle(post.summary ?? ""),
      inputDate: post.createTime ?? null,
      storeName: currentStoreTitle,
      scheduledFor: post.createTime ?? null,
      startAt: null,
      repeat: "—",
      nextRepeat: null,
      status: post.state ?? "LIVE",
      wfApproval: "WFなし",
      summary: post.summary ?? "",
      cta: post.callToAction ?? null,
      searchUrl: post.searchUrl,
    }))

    const s: UnifiedRow[] = scheduled.map((sp, idx) => ({
      key: `s:${sp.id}`,
      source: "scheduled",
      no: idx + 1,
      imageUrl: sp.mediaUrls?.[0] ?? null,
      postType: sp.postType,
      title: extractTitle(sp.summary),
      inputDate: sp.createdAt ?? null,
      storeName: sp.storeName,
      scheduledFor: sp.scheduledFor,
      startAt: null,
      repeat: "—",
      nextRepeat: null,
      status: sp.status,
      wfApproval: "WFなし",
      summary: sp.summary,
      cta: sp.callToAction ?? null,
      scheduledId: sp.id,
    }))

    const all = [...s, ...p].sort((a, b) => {
      const da = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0
      const db = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0
      return db - da
    })
    return all.map((r, i) => ({ ...r, no: all.length - i }))
  }, [published, scheduled, currentStoreTitle])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.storeName.toLowerCase().includes(q)
    )
  }, [rows, search])

  const paginatedRows = filteredRows.slice(0, pageSize)

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const toggleSelectAll = () => {
    const selectable = paginatedRows
      .filter((r) => r.source === "scheduled")
      .map((r) => r.key)
    if (selected.size === selectable.length && selectable.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectable))
    }
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selected)
      .filter((k) => k.startsWith("s:"))
      .map((k) => parseInt(k.slice(2), 10))
    if (ids.length === 0) {
      setError("削除できる予約が選択されていません（投稿済みは削除不可）")
      return
    }
    if (!confirm(`${ids.length} 件の予約を削除しますか？`)) return
    let ok = 0
    for (const id of ids) {
      const res = await fetch(`/api/scheduled-posts?id=${id}`, { method: "DELETE" })
      if (res.ok) ok++
    }
    setSuccess(`${ok} 件削除しました`)
    setSelected(new Set())
    await loadScheduled()
  }

  const handleDownload = async () => {
    try {
      const res = await fetch("/api/scheduled-posts/import")
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `posts-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleTemplate = async () => {
    const res = await fetch("/api/scheduled-posts/import?template=1")
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "post-import-template.xlsx"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setError(null)
    setSuccess(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/scheduled-posts/import", {
        method: "POST",
        body: formData,
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setSuccess(
        `インポート完了: 登録 ${j.inserted} / ${j.totalRows} 件${
          j.errors?.length ? ` / エラー ${j.errors.length} 件` : ""
        }`
      )
      if (j.errors?.length > 0) {
        const es = j.errors
          .slice(0, 5)
          .map((e: { rowIndex: number; error: string }) => `行${e.rowIndex}: ${e.error}`)
          .join("\n")
        setError(
          `一部エラー:\n${es}${
            j.errors.length > 5 ? `\n...他 ${j.errors.length - 5} 件` : ""
          }`
        )
      }
      await loadScheduled()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const openDuplicate = (row: UnifiedRow) => {
    // モーダル open + 内容 pre-fill は下の modal component に prop 渡し
    duplicateSourceRef.current = row
    setShowNewModal(true)
  }

  const duplicateSourceRef = useRef<UnifiedRow | null>(null)

  return (
    <div>
      {/* ヘッダー */}
      <h1 className="text-[26px] font-normal mb-3">
        投稿一覧｜Googleビジネスプロフィール
      </h1>

      <div className="text-[13px] text-gray-700 space-y-1 mb-4">
        <p>Googleビジネスプロフィールに表示する投稿の一覧です。</p>
        <p>
          店舗ごとに投稿する場合は、「新規投稿」ボタンをクリックしてご入力ください。
        </p>
        <p>
          複数店舗分の投稿を予約する場合は、「一括投稿用テンプレート」からEXCELファイルをダウンロードいただき、EXCELに投稿情報を入力後、
        </p>
        <p>
          「投稿一括インポート」よりEXCELファイルインポートしてください。投稿内容にファイルがある場合は、ファイルアップロードよりファイルインポートしてください。
        </p>
        <p>店舗基本情報画面で設定した「投稿URL事前設定」を確認する場合は「投稿URL事前設定リスト」を取得してください。</p>
      </div>

      <div className="text-[13px] text-gray-700 space-y-1 mb-4">
        <p>※1時間以内の連続投稿は、お控え頂けますようお願い致します。</p>
        <p>
          ※投稿一括インポート時にエラーが発生した場合は、エラーとなった店舗のみを対象に、再度インポートしていただくようお願いいたします。
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 pr-3 text-sm border border-gray-300 rounded-l w-64 bg-white"
              placeholder=""
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          </div>
          <button className="h-9 px-4 text-sm border border-l-0 border-gray-300 rounded-r bg-gray-50 hover:bg-gray-100">
            検索
          </button>
        </div>

        <div className="flex-1" />

        {/* 投稿一括インポート（dropdown） */}
        <div className="relative">
          <button
            onClick={() => setImportDropdownOpen(!importDropdownOpen)}
            disabled={importing}
            className="h-9 px-4 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 flex items-center gap-1.5"
          >
            {importing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            投稿一括インポート
            <ChevronDown className="h-3 w-3" />
          </button>
          {importDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setImportDropdownOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white border rounded shadow-lg py-1 min-w-[180px]">
                <button
                  onClick={() => {
                    setImportDropdownOpen(false)
                    fileInputRef.current?.click()
                  }}
                  className="w-full text-left text-sm px-4 py-2 hover:bg-gray-50"
                >
                  通常インポート
                </button>
                <button
                  onClick={() => {
                    setImportDropdownOpen(false)
                    handleTemplate()
                  }}
                  className="w-full text-left text-sm px-4 py-2 hover:bg-gray-50"
                >
                  テンプレートDL
                </button>
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="h-9 px-4 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 flex items-center gap-1.5"
        >
          <Upload className="h-3.5 w-3.5" />
          ファイルアップロード
        </button>

        <button
          onClick={handleDownload}
          className="h-9 px-4 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 flex items-center gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          ダウンロード
        </button>

        <button
          onClick={() => {
            duplicateSourceRef.current = null
            setShowNewModal(true)
          }}
          disabled={!locationName}
          className="h-9 px-4 text-sm text-white bg-[#4a90e2] hover:bg-[#3a7cc8] rounded flex items-center gap-1.5 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          新規投稿
        </button>
      </div>

      {/* Bulk-op row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              onChange={toggleSelectAll}
              checked={
                paginatedRows.filter((r) => r.source === "scheduled").length > 0 &&
                selected.size ===
                  paginatedRows.filter((r) => r.source === "scheduled").length
              }
              className="h-3.5 w-3.5"
            />
            一括操作
          </label>
          <button
            onClick={handleBulkDelete}
            disabled={selected.size === 0}
            className="h-8 px-3 text-sm border border-gray-300 rounded bg-gray-50 disabled:text-gray-400 hover:bg-gray-100 disabled:hover:bg-gray-50"
          >
            削除
          </button>
        </div>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
          className="h-8 px-2 text-sm border border-gray-300 rounded bg-white"
        >
          <option value={20}>20件</option>
          <option value={50}>50件</option>
          <option value={100}>100件</option>
        </select>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800 whitespace-pre-wrap">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          {success}
        </div>
      )}

      {!locationName && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 flex items-center gap-2">
          <Info className="h-4 w-4" />
          画面上部の店舗セレクタで店舗を選択すると、その店舗の投稿一覧が表示されます。予約分は全店舗が表示されます。
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
        </div>
      )}

      {/* Table — 高密度: 1行36pxで10行以上一度に見える */}
      <div className="border border-gray-200 rounded bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 text-[11px] text-gray-600 border-b">
              <tr className="h-9">
                <th className="w-7 px-1.5"></th>
                <th className="text-left px-2 font-normal w-10">NO</th>
                <th className="text-left px-2 font-normal w-12">画像</th>
                <th className="text-left px-2 font-normal whitespace-nowrap">投稿種類</th>
                <th className="text-left px-2 font-normal">タイトル</th>
                <th className="text-left px-2 font-normal whitespace-nowrap">入力日</th>
                <th className="text-left px-2 font-normal">店舗名</th>
                <th className="text-left px-2 font-normal whitespace-nowrap">投稿日時</th>
                <th className="text-left px-2 font-normal whitespace-nowrap">開始日時</th>
                <th className="text-left px-2 font-normal whitespace-nowrap">繰り返し</th>
                <th className="text-left px-2 font-normal whitespace-nowrap">次回投稿</th>
                <th className="text-left px-2 font-normal">ステータス</th>
                <th className="text-left px-2 font-normal">WF承認</th>
                <th className="text-left px-2 font-normal">複製</th>
                <th className="text-left px-2 font-normal w-10">詳細</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 && !loading && (
                <tr>
                  <td colSpan={15} className="text-center py-10 text-muted-foreground text-sm">
                    投稿がありません
                  </td>
                </tr>
              )}
              {paginatedRows.map((r) => (
                <tr key={r.key} className="border-t hover:bg-gray-50 h-9">
                  <td className="px-1.5 text-center">
                    {r.source === "scheduled" ? (
                      <input
                        type="checkbox"
                        checked={selected.has(r.key)}
                        onChange={() => toggleSelected(r.key)}
                        className="h-3 w-3"
                      />
                    ) : null}
                  </td>
                  <td className="px-2 text-gray-500">{r.no}</td>
                  <td className="px-2 py-1">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.imageUrl}
                        alt=""
                        className="w-7 h-7 rounded-sm object-cover"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-sm bg-gray-100 flex items-center justify-center">
                        <ImageIcon className="h-3 w-3 text-gray-400" />
                      </div>
                    )}
                  </td>
                  <td className="px-2 whitespace-nowrap">
                    {POST_TYPE_LABELS[r.postType] ?? r.postType}
                  </td>
                  <td className="px-2 max-w-[180px]">
                    <div className="truncate" title={r.title}>
                      {r.title || "—"}
                    </div>
                  </td>
                  <td className="px-2 text-gray-600 whitespace-nowrap">
                    {formatDateTime(r.inputDate)}
                  </td>
                  <td className="px-2 max-w-[140px]">
                    <div className="truncate" title={r.storeName}>
                      {r.storeName}
                    </div>
                  </td>
                  <td className="px-2 text-gray-600 whitespace-nowrap">
                    {formatDateTime(r.scheduledFor)}
                  </td>
                  <td className="px-2 text-gray-400">—</td>
                  <td className="px-2 text-gray-400">—</td>
                  <td className="px-2 text-gray-400">—</td>
                  <td
                    className={`px-2 whitespace-nowrap ${STATUS_COLORS[r.status] ?? "text-gray-700"}`}
                  >
                    {STATUS_LABELS[r.status] ?? r.status}
                  </td>
                  <td className="px-2 text-gray-500">{r.wfApproval}</td>
                  <td className="px-2">
                    <button
                      onClick={() => openDuplicate(r)}
                      className="text-[11px] text-[#4a90e2] border border-gray-300 rounded px-2 py-0.5 hover:bg-blue-50"
                    >
                      複製
                    </button>
                  </td>
                  <td className="px-2">
                    {r.source === "scheduled" ? (
                      <Link
                        href={`/scheduled-posts?highlight=${r.scheduledId}`}
                        className="text-gray-400 hover:text-gray-700 inline-block"
                        title="詳細"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Link>
                    ) : r.searchUrl ? (
                      <a
                        href={r.searchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-400 hover:text-gray-700 inline-block"
                        title="Google で表示"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-gray-300">
                        <Edit3 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredRows.length > pageSize && (
        <div className="mt-3 text-xs text-muted-foreground text-center">
          {pageSize} 件を表示中 / 全 {filteredRows.length} 件
          <ChevronRight className="h-3 w-3 inline ml-1" />
          <button
            onClick={() => setPageSize((v) => v + 20)}
            className="text-[#4a90e2] hover:underline ml-1"
          >
            さらに表示
          </button>
        </div>
      )}

      {/* New post modal */}
      <NewPostModal
        isOpen={showNewModal}
        onClose={() => {
          setShowNewModal(false)
          duplicateSourceRef.current = null
        }}
        onSuccess={(msg) => {
          setSuccess(msg)
          setShowNewModal(false)
          duplicateSourceRef.current = null
          loadAll()
        }}
        onError={(m) => setError(m)}
        locations={locations}
        defaultLocationName={locationName}
        duplicateFrom={duplicateSourceRef.current}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                          New Post Modal (Reference-close)                  */
/* -------------------------------------------------------------------------- */

interface NewPostModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
  locations: Array<{ name: string; title: string }>
  defaultLocationName: string | null
  duplicateFrom: UnifiedRow | null
}

function NewPostModal({
  isOpen,
  onClose,
  onSuccess,
  onError,
  locations,
  defaultLocationName,
  duplicateFrom,
}: NewPostModalProps) {
  const [topicType, setTopicType] = useState<"STANDARD" | "OFFER" | "EVENT">("STANDARD")
  const [title, setTitle] = useState("")
  const [timing, setTiming] = useState<"immediate" | "scheduled">("immediate")
  const [scheduledDate, setScheduledDate] = useState(() => toDateOnly(new Date()))
  const [scheduledTime, setScheduledTime] = useState("10:00")
  const [summary, setSummary] = useState("")
  const [mediaUrl, setMediaUrl] = useState("")
  const [ctaType, setCtaType] = useState("ACTION_TYPE_UNSPECIFIED")
  const [ctaUrl, setCtaUrl] = useState("")
  const [hashtags, setHashtags] = useState("")
  const [store, setStore] = useState(defaultLocationName ?? "")
  const [showStorePicker, setShowStorePicker] = useState(false)
  const [imageLibraryOpen, setImageLibraryOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen && duplicateFrom) {
      setTopicType((duplicateFrom.postType as "STANDARD" | "OFFER" | "EVENT") ?? "STANDARD")
      setTitle(duplicateFrom.title === "—" ? "" : duplicateFrom.title)
      setSummary(duplicateFrom.summary ?? "")
      setMediaUrl(duplicateFrom.imageUrl ?? "")
      if (duplicateFrom.cta?.actionType) {
        setCtaType(duplicateFrom.cta.actionType)
        setCtaUrl(duplicateFrom.cta.url ?? "")
      }
      setStore(defaultLocationName ?? "")
    } else if (isOpen) {
      setTopicType("STANDARD")
      setTitle("")
      setSummary("")
      setMediaUrl("")
      setCtaType("ACTION_TYPE_UNSPECIFIED")
      setCtaUrl("")
      setHashtags("")
      setStore(defaultLocationName ?? "")
      setTiming("immediate")
    }
  }, [isOpen, duplicateFrom, defaultLocationName])

  if (!isOpen) return null

  const handleSubmit = async (asDraft: boolean) => {
    if (!store) {
      onError("店舗を選択してください")
      return
    }
    if (!summary.trim()) {
      onError("投稿内容を入力してください")
      return
    }

    const callToAction =
      ctaType !== "ACTION_TYPE_UNSPECIFIED" && ctaUrl.trim()
        ? { actionType: ctaType, url: ctaUrl.trim() }
        : undefined

    const fullSummary = hashtags.trim()
      ? `${summary.trim()}\n\n${hashtags.trim()}`
      : summary.trim()

    setSubmitting(true)
    try {
      if (asDraft || timing === "scheduled") {
        // 予約 or 下書き
        const scheduledFor =
          asDraft && timing === "immediate"
            ? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString() // draft = far future
            : new Date(`${scheduledDate}T${scheduledTime}`).toISOString()

        const body: Record<string, unknown> = {
          locationName: store,
          scheduledFor,
          summary: fullSummary,
          postType: topicType,
        }
        if (mediaUrl.trim()) body.mediaUrl = mediaUrl.trim()
        if (callToAction) body.callToAction = callToAction

        const res = await fetch("/api/scheduled-posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.detail || j.error || `HTTP ${res.status}`)
        onSuccess(asDraft ? "下書きを保存しました" : "予約を作成しました")
      } else {
        // 即時
        const post: Record<string, unknown> = {
          languageCode: "ja",
          summary: fullSummary,
          topicType,
        }
        if (callToAction) post.callToAction = callToAction
        if (mediaUrl.trim()) {
          post.media = [{ mediaFormat: "PHOTO", sourceUrl: mediaUrl.trim() }]
        }
        const res = await fetch("/api/gbp/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationName: store, post }),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.detail || j.error || `HTTP ${res.status}`)
        onSuccess("投稿しました")
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded shadow-2xl w-full max-w-4xl my-8">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-700 mb-1">
                Googleビジネスプロフィールに表示する投稿を新規登録・編集できます。
              </p>
              <p className="text-xs text-gray-500">
                Google繰り返し設定をご利用の場合は、Google以外の媒体へ投稿は実施できません。またワークフロー機能もご利用いただけません。
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 ml-4"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Topic tabs */}
          <div className="flex gap-6 mt-4 border-b -mx-6 px-6">
            {(
              [
                { key: "STANDARD", label: "最新情報" },
                { key: "OFFER", label: "特典" },
                { key: "EVENT", label: "イベント" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTopicType(t.key)}
                className={`pb-3 text-[15px] font-medium border-b-2 -mb-px transition-colors ${
                  topicType === t.key
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
        <div className="px-6 py-6 space-y-6">
          {/* 媒体 */}
          <div>
            <label className="text-sm font-medium block mb-2">媒体</label>
            <div className="grid grid-cols-3 gap-y-2 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked disabled className="h-3.5 w-3.5" />
                Google
              </label>
              {["Yahoo!", "エキテン", "Facebook", "Instagram", "X (旧Twitter)"].map(
                (m) => (
                  <label
                    key={m}
                    className="flex items-center gap-1.5 text-gray-400"
                    title="現在このツールでは Google のみ対応"
                  >
                    <input
                      type="checkbox"
                      disabled
                      className="h-3.5 w-3.5 opacity-40"
                    />
                    {m}
                  </label>
                )
              )}
            </div>
          </div>

          {/* タイトル */}
          <div>
            <label className="text-sm font-medium block mb-1">タイトル</label>
            <p className="text-xs text-gray-500 mb-2">
              タイトルを50文字以内でご入力ください。(Googleは未入力可能ですが、管理用にご入力頂けます。Yahoo!は必須)
            </p>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              className="w-full h-10 px-3 text-sm border rounded"
            />
          </div>

          {/* 投稿日時 */}
          <div>
            <label className="text-sm font-medium block mb-2">投稿日時</label>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={timing === "immediate"}
                  onChange={() => setTiming("immediate")}
                />
                即時
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm shrink-0">
                  <input
                    type="radio"
                    checked={timing === "scheduled"}
                    onChange={() => setTiming("scheduled")}
                  />
                  予約
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  disabled={timing !== "scheduled"}
                  className="h-9 px-2 text-sm border rounded disabled:bg-gray-50 disabled:text-gray-400"
                />
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  disabled={timing !== "scheduled"}
                  className="h-9 px-2 text-sm border rounded disabled:bg-gray-50 disabled:text-gray-400"
                />
                <span className="text-xs text-gray-500">(時間省略可)</span>
              </div>
              <div
                className="flex items-center gap-3 opacity-50"
                title="繰り返し設定は準備中"
              >
                <label className="flex items-center gap-2 text-sm shrink-0">
                  <input type="radio" disabled />
                  Google繰り返し設定
                </label>
                <input
                  type="date"
                  disabled
                  className="h-9 px-2 text-sm border rounded bg-gray-50"
                />
                <input
                  type="time"
                  disabled
                  className="h-9 px-2 text-sm border rounded bg-gray-50"
                />
                <span className="text-xs text-gray-500">(時間省略可)</span>
              </div>
            </div>
          </div>

          {/* 掲載期間 (Yahoo記載欄) — 情報表示のみ */}
          <div className="opacity-50">
            <label className="text-sm font-medium block mb-2">
              掲載期間の設定（Yahoo!記載欄）
            </label>
            <div className="flex items-center gap-3">
              <label className="text-sm w-16">掲載開始</label>
              <input
                type="date"
                disabled
                className="h-9 px-2 text-sm border rounded bg-gray-50 flex-1 max-w-[180px]"
              />
              <label className="text-sm">掲載終了</label>
              <input
                type="date"
                disabled
                className="h-9 px-2 text-sm border rounded bg-gray-50 flex-1 max-w-[180px]"
              />
            </div>
          </div>

          {/* 投稿内容 */}
          <div>
            <div className="flex items-center gap-3 mb-1">
              <label className="text-sm font-medium">投稿内容</label>
              <button
                type="button"
                className="text-xs text-[#4a90e2] border border-[#4a90e2] rounded px-3 py-1 opacity-50"
                title="準備中"
              >
                詳細文AIアシスタント
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              投稿内容文を作成する場合は、投稿文AIアシスタントをクリックしてください。
            </p>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={5}
              maxLength={1500}
              placeholder="ホワイトニングの新しいプランが追加されました。"
              className="w-full px-3 py-2 text-sm border rounded"
            />
            <p className="text-xs text-gray-500 mt-2">
              投稿内容の文字数制限は、Google1500文字以内・Yahoo!330文字以内。
            </p>
            <p className="text-xs text-gray-500">
              文字数合計は、投稿内容+ボタンURL+ハッシュタグが全て含まれます。AI翻訳機能をご利用の場合、翻訳言語も文字数合計に含まれますのでご注意ください。
            </p>
          </div>

          {/* 画像 */}
          <div>
            <label className="text-sm font-medium block mb-2">画像</label>
            <div className="flex items-center gap-3 mb-2">
              <button
                type="button"
                className="text-sm text-[#4a90e2] border border-[#4a90e2] rounded px-4 h-9 opacity-50"
                title="準備中"
              >
                画像AIアシスタント
              </button>
              <p className="text-xs text-gray-500">
                画像を作成する場合は、画像AIアシスタントをクリックしてください。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setImageLibraryOpen(true)}
                className="text-sm text-[#4a90e2] border border-[#4a90e2] rounded px-4 h-9 hover:bg-blue-50"
              >
                ファイル選択
              </button>
              {mediaUrl ? (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl}
                    alt=""
                    className="w-10 h-10 rounded object-cover border"
                  />
                  <span className="text-xs text-gray-600 max-w-[240px] truncate">
                    {mediaUrl.split("/").pop() ?? mediaUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMediaUrl("")}
                    className="text-xs text-red-500 hover:underline"
                  >
                    解除
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-500">選択されていません。</span>
              )}
            </div>
          </div>

          {/* ボタンの追加 */}
          <div>
            <label className="text-sm font-medium mb-2 inline-flex items-center gap-2">
              ボタンの追加
              <span
                className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center"
                title="投稿の下に表示されるアクションボタン"
              >
                ?
              </span>
            </label>
            <div className="flex gap-2 items-center">
              <select
                value={ctaType}
                onChange={(e) => setCtaType(e.target.value)}
                className="h-9 px-2 text-sm border rounded bg-white w-40"
              >
                <option value="ACTION_TYPE_UNSPECIFIED">なし</option>
                {Object.entries(CTA_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {ctaType !== "ACTION_TYPE_UNSPECIFIED" && ctaType !== "CALL" && (
                <input
                  type="url"
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="https://..."
                  className="h-9 px-3 text-sm border rounded flex-1"
                />
              )}
            </div>
          </div>

          {/* ハッシュタグ */}
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <label className="text-sm font-medium inline-flex items-center gap-2">
                ハッシュタグ
                <span
                  className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center"
                  title="投稿内に含めるハッシュタグ"
                >
                  ?
                </span>
              </label>
              <button
                type="button"
                className="text-xs text-[#4a90e2] border border-[#4a90e2] rounded px-3 py-1 opacity-50"
                title="準備中"
              >
                ハッシュタグAI生成
              </button>
              <button
                type="button"
                className="text-xs text-[#4a90e2] border border-[#4a90e2] rounded px-3 py-1 opacity-50"
                title="準備中"
              >
                ハッシュタグリスト
              </button>
              <label className="flex items-center gap-2 text-xs text-gray-500 ml-auto">
                <span
                  className="relative inline-flex h-5 w-9 items-center rounded-full bg-gray-300"
                  title="準備中"
                >
                  <span className="inline-block h-3 w-3 transform translate-x-1 rounded-full bg-white" />
                </span>
                OFF 店舗WEBサイトを加味して生成
              </label>
            </div>
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#タグ1 #タグ2"
              className="w-full h-10 px-3 text-sm border rounded"
            />
          </div>

          {/* 承認者 */}
          <div>
            <label className="text-sm font-medium block mb-2">承認者</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled
                className="text-sm border border-gray-300 rounded px-4 h-9 bg-gray-50 text-gray-400"
                title="準備中"
              >
                ワークフロー申請
              </button>
              <span className="text-sm text-gray-500">未申請</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              ワークフロー申請ボタンをクリックして、ワークフローの申請者設定を行ってください。
            </p>
            <p className="text-xs text-gray-500">
              ワークフローの申請を行った投稿は、承認がおりてから投稿処理されます。
            </p>
          </div>

          {/* 店舗を選択 */}
          <div>
            <label className="text-sm font-medium block mb-2">店舗を選択</label>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setShowStorePicker(!showStorePicker)}
                className="text-sm text-[#4a90e2] border border-[#4a90e2] rounded px-4 h-9 hover:bg-blue-50"
              >
                店舗選択
              </button>
              {store && (
                <span className="text-sm text-gray-700">
                  {locations.find((l) => l.name === store)?.title ?? store}
                </span>
              )}
              <p className="text-xs text-gray-500 flex-1">
                特定の店舗のみ投稿される場合はこちらから設定してください。
              </p>
            </div>
            {showStorePicker && (
              <div className="mt-2 border rounded p-3 max-h-64 overflow-y-auto">
                <select
                  value={store}
                  onChange={(e) => {
                    setStore(e.target.value)
                    setShowStorePicker(false)
                  }}
                  className="w-full h-10 px-2 text-sm border rounded bg-white"
                >
                  <option value="">選択してください</option>
                  {locations.map((l) => (
                    <option key={l.name} value={l.name}>
                      {l.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  ※ 本ツールでは 1 投稿につき 1 店舗のみ選択できます。複数店舗まとめて予約したい場合は EXCEL 一括インポートをご利用ください。
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex items-center justify-center gap-3 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-8 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={submitting || !summary.trim() || !store}
            className="h-10 px-8 text-sm text-white bg-[#4a90e2] hover:bg-[#3a7cc8] rounded disabled:opacity-50"
          >
            {submitting ? "処理中…" : "登録する"}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={submitting || !summary.trim() || !store}
            className="h-10 px-8 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            下書き保存
          </button>
        </div>

        <p className="text-xs text-gray-500 px-6 pb-4">
          ※APIの仕様にて、このツールから動画投稿を行うことができません。
        </p>
      </div>

      <ImageLibraryModal
        isOpen={imageLibraryOpen}
        onClose={() => setImageLibraryOpen(false)}
        locationName={store || defaultLocationName}
        onSelect={(url) => setMediaUrl(url)}
      />
    </div>
  )
}
