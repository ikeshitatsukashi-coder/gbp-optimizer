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
import { fetchJson } from "@/lib/fetch-json"

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
  pending: "投稿待ち",
  draft: "下書き",
  failed: "エラー投稿",
}

const STATUS_COLORS: Record<string, string> = {
  LIVE: "text-[#4a90e2]",
  posted: "text-[#4a90e2]",
  pending: "text-gray-700",
  draft: "text-gray-500",
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
  const [tab, setTab] = useState<"published" | "queued">("published")
  const [importDropdownOpen, setImportDropdownOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showNewModal, setShowNewModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 画像アーカイブ（アップロード済み画像の閲覧・追加・削除）
  const [imageManagerOpen, setImageManagerOpen] = useState(false)

  // スプレッドシート直接取り込み（URL入力 → 列対応づけ → 取り込み）
  const [sheetModalOpen, setSheetModalOpen] = useState(false)
  const [sheetUrl, setSheetUrl] = useState("")
  const [sheetStep, setSheetStep] = useState<"url" | "map">("url")
  const [sheetPreview, setSheetPreview] = useState<{
    headers: string[]
    sampleRows: Record<string, unknown>[]
    rowCount: number
    sheetTitle?: string
    warning?: string
  } | null>(null)
  const [sheetMapping, setSheetMapping] = useState<Record<string, string>>({})
  const [sheetTabs, setSheetTabs] = useState<{ gid: string; title: string }[]>([])
  const [sheetGid, setSheetGid] = useState<string>("")

  const openSheetModal = () => {
    setSheetStep("url")
    setSheetPreview(null)
    setSheetMapping({})
    setSheetTabs([])
    setSheetGid("")
    setSheetModalOpen(true)
  }

  // ステップ1: プレビュー取得（タブ一覧・見出し・推定マッピング）
  const handleSheetPreview = async (gid?: string) => {
    if (!sheetUrl.trim()) {
      setError("スプレッドシートのURLを入力してください")
      return
    }
    setImporting(true)
    setError(null)
    try {
      const { ok, data, error } = await fetchJson<{
        headers: string[]
        sampleRows: Record<string, unknown>[]
        rowCount: number
        sheetTitle?: string
        selectedGid?: string
        tabs?: { gid: string; title: string }[]
        suggestedMapping: Record<string, string>
        warning?: string
      }>("/api/scheduled-posts/import-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: sheetUrl.trim(),
          preview: true,
          ...(gid ? { gid } : {}),
        }),
      })
      if (!ok || !data) throw new Error(error ?? "シートを読み取れませんでした")
      setSheetPreview({
        headers: data.headers,
        sampleRows: data.sampleRows,
        rowCount: data.rowCount,
        sheetTitle: data.sheetTitle,
        warning: data.warning,
      })
      setSheetTabs(data.tabs ?? [])
      setSheetGid(data.selectedGid ?? "")
      setSheetMapping(data.suggestedMapping ?? {})
      setSheetStep("map")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  // ステップ2: マッピングを適用して本取り込み
  const handleSheetImport = async () => {
    // 必須チェック: (店舗名 or 店舗ID) / 日時系のいずれか / 本文
    if (!sheetMapping.storeName && !sheetMapping.locationName) {
      setError("「店舗名」または「店舗ID」の列を選択してください")
      return
    }
    if (
      !sheetMapping.scheduledFor &&
      !sheetMapping.scheduledDate &&
      !sheetMapping.immediateFlag
    ) {
      setError(
        "日時の列を選択してください（「予約日時（1列）」または「予約投稿日」。即時投稿○列だけでも可）"
      )
      return
    }
    if (!sheetMapping.summary) {
      setError("「本文」の列を選択してください")
      return
    }
    setImporting(true)
    setError(null)
    setSuccess(null)
    try {
      const { ok, data, error } = await fetchJson<{
        inserted: number
        totalRows: number
        sheetTitle?: string
        errors?: { rowIndex: number; error: string }[]
      }>("/api/scheduled-posts/import-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: sheetUrl.trim(),
          mapping: sheetMapping,
          ...(sheetGid ? { gid: sheetGid } : {}),
        }),
      })
      if (!ok || !data) throw new Error(error ?? "取り込みに失敗しました")
      setSheetModalOpen(false)
      setSuccess(
        `取り込み完了${data.sheetTitle ? `（${data.sheetTitle}）` : ""}: 登録 ${data.inserted} / ${data.totalRows} 件${
          data.errors?.length ? ` / エラー ${data.errors.length} 件` : ""
        }`
      )
      if (data.errors && data.errors.length > 0) {
        const es = data.errors
          .slice(0, 5)
          .map((er) => `行${er.rowIndex}: ${er.error}`)
          .join("\n")
        setError(
          `一部エラー:\n${es}${
            data.errors.length > 5 ? `\n...他 ${data.errors.length - 5} 件` : ""
          }`
        )
      }
      await loadScheduled()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

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

    // タブ別: 投稿済 = v4 の公開済み投稿 + 実行済み予約（投稿済/失敗のうち posted）
    //          投稿待ち = 予約中 (pending) / 下書き (draft) / エラー (failed)
    // ※ posted の予約レコードは v4 側にも現れて二重表示になるため queued からは除外
    const source =
      tab === "published"
        ? p
        : s.filter((r) => r.status === "pending" || r.status === "draft" || r.status === "failed")

    const all = [...source].sort((a, b) => {
      const da = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0
      const db = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0
      return db - da
    })
    return all.map((r, i) => ({ ...r, no: all.length - i }))
  }, [published, scheduled, currentStoreTitle, tab])

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
      // xlsx はブラウザ側で解析し、必要な行データ（テキスト）だけを送信する。
      // ファイル自体を送るとサイズ超過(413)で失敗するため。
      const XLSX = await import("xlsx")
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const sheetName = wb.SheetNames[0]
      if (!sheetName) throw new Error("シートが見つかりません")
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[sheetName],
        { raw: false, defval: null }
      )
      if (rows.length === 0) throw new Error("データ行がありません（1行目は見出し）")

      const { ok, data, error } = await fetchJson<{
        inserted: number
        totalRows: number
        errors?: { rowIndex: number; error: string }[]
      }>("/api/scheduled-posts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      })
      if (!ok || !data) throw new Error(error ?? "インポートに失敗しました")

      setSuccess(
        `インポート完了: 登録 ${data.inserted} / ${data.totalRows} 件${
          data.errors?.length ? ` / エラー ${data.errors.length} 件` : ""
        }`
      )
      if (data.errors && data.errors.length > 0) {
        const es = data.errors
          .slice(0, 5)
          .map((er) => `行${er.rowIndex}: ${er.error}`)
          .join("\n")
        setError(
          `一部エラー:\n${es}${
            data.errors.length > 5 ? `\n...他 ${data.errors.length - 5} 件` : ""
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
        <p>
          予約投稿および投稿待ちは、「投稿待ち・予約中・エラー投稿・下書き」のタブを押下してご確認ください。
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
                    openSheetModal()
                  }}
                  className="w-full text-left text-sm px-4 py-2 hover:bg-gray-50 font-medium text-[#4a90e2]"
                >
                  スプレッドシートから取り込む
                </button>
                <button
                  onClick={() => {
                    setImportDropdownOpen(false)
                    fileInputRef.current?.click()
                  }}
                  className="w-full text-left text-sm px-4 py-2 hover:bg-gray-50"
                >
                  Excelファイルから取り込む
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
          onClick={() => setImageManagerOpen(true)}
          className="h-9 px-4 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 flex items-center gap-1.5"
          title="アップロード済み画像の一覧・追加・URLコピー・削除"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          画像アーカイブ
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

      {/* Tabs: 投稿済 / 投稿待ち・予約中・エラー投稿・下書き（reference 準拠） */}
      <div className="flex items-center justify-between border-b border-gray-200 mb-2">
        <div className="flex gap-8">
          {(
            [
              {
                key: "published",
                label: "投稿済（各媒体へ投稿・媒体からの投稿）",
              },
              {
                key: "queued",
                label: `投稿待ち・予約中・エラー投稿・下書き`,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key)
                setSelected(new Set())
              }}
              className={`pb-2.5 text-[14px] border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-[#4a90e2] text-[#4a90e2] font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
          className="h-8 px-2 text-sm border border-gray-300 rounded bg-white mb-1"
        >
          <option value={20}>20件</option>
          <option value={50}>50件</option>
          <option value={100}>100件</option>
        </select>
      </div>

      {/* Bulk-op row（投稿待ちタブのみ操作可能） */}
      {tab === "queued" && (
        <div className="flex items-center gap-2 mb-2">
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
      )}

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
                <th className="text-left px-2 font-normal whitespace-nowrap">媒体</th>
                <th className="text-left px-2 font-normal whitespace-nowrap">繰り返し</th>
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
                  <td className="px-2 text-gray-700">Google</td>
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

      {/* 画像アーカイブ（閲覧・アップロード・URLコピー・削除） */}
      <ImageLibraryModal
        isOpen={imageManagerOpen}
        onClose={() => setImageManagerOpen(false)}
        locationName={locationName}
        mode="manage"
      />

      {/* スプレッドシート直接取り込み（2ステップ） */}
      {sheetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">
                スプレッドシートから取り込む
                {sheetStep === "map" && "（列の対応づけ）"}
              </h2>
              <button
                onClick={() => setSheetModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {sheetStep === "url" ? (
              <>
                <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                  Googleスプレッドシートの共有リンクを貼り付けてください。ダウンロード不要で直接読み込みます。
                  <br />
                  ※ログイン中のGoogleアカウント（meo-support@li-go.jp）がそのシートを開ける必要があります。
                  取り込むシート（タブ）を指定する場合は、そのタブを開いた状態のURL（末尾に{" "}
                  <code className="bg-gray-100 px-1 rounded">#gid=…</code> が付く）を貼り付けてください。
                </p>
                <label className="block text-sm font-bold mb-1">スプレッドシートURL</label>
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/xxxxx/edit#gid=0"
                  className="w-full h-10 px-3 text-sm border rounded mb-4"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setSheetModalOpen(false)}
                    disabled={importing}
                    className="h-10 px-6 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={() => handleSheetPreview()}
                    disabled={importing || !sheetUrl.trim()}
                    className="h-10 px-6 text-sm text-white bg-[#4a90e2] hover:bg-[#3a7cc8] rounded disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> 読み取り中…
                      </>
                    ) : (
                      "次へ（列を確認）"
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* タブ（ページ）選択 */}
                {sheetTabs.length > 1 && (
                  <div className="flex items-center gap-3 mb-3 bg-gray-50 border rounded p-3">
                    <label className="text-sm font-bold shrink-0">
                      取り込むページ（タブ）
                    </label>
                    <select
                      value={sheetGid}
                      onChange={(e) => handleSheetPreview(e.target.value)}
                      disabled={importing}
                      className="h-9 px-2 text-sm border rounded flex-1 min-w-0"
                    >
                      {sheetTabs.map((t) => (
                        <option key={t.gid} value={t.gid}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                    {importing && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                  </div>
                )}
                {sheetTabs.length > 1 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5 mb-3">
                    ⚠️ 取り込まれるのは<b>選択中のこのタブ1枚だけ</b>です（他のタブ・他の会社分は取り込まれません）。
                    また、登録されるのは「予約」までで、この操作でGoogleに投稿されることはありません。
                  </p>
                )}
                {sheetPreview?.warning && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2.5 mb-3">
                    {sheetPreview.warning}
                  </p>
                )}
                <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                  タブ「{sheetPreview?.sheetTitle}」（データ {sheetPreview?.rowCount} 行）を読み取りました。
                  下で、あなたのシートの<b>どの列</b>が各項目に当たるかを選んでください。
                  <b className="text-red-600">＊</b> は必須です。
                </p>
                <div className="space-y-2.5 mb-4">
                  {(
                    [
                      { key: "storeName", label: "店舗名", req: true, note: "または店舗ID" },
                      { key: "locationName", label: "店舗ID", req: false, note: "Google のID。GMOの店舗IDは不一致のため店舗名を推奨" },
                      { key: "scheduledFor", label: "予約日時（1列）", req: false, note: "日時が1列の場合。例 2026-07-15 10:00" },
                      { key: "scheduledDate", label: "予約投稿日", req: false, note: "日付と時間が別列の場合（GMO形式）" },
                      { key: "scheduledTime", label: "予約投稿時間", req: false, note: "例 9:00" },
                      { key: "immediateFlag", label: "即時投稿（○列）", req: false, note: "○の行は「今すぐ」の予約として登録" },
                      { key: "draftFlag", label: "下書き保存（○列）", req: false, note: "○の行は下書きとして登録" },
                      { key: "summary", label: "本文", req: true, note: "" },
                      { key: "summary2", label: "本文2", req: false, note: "本文の後ろに連結" },
                      { key: "hashtags", label: "ハッシュタグ", req: false, note: "本文末尾に追加" },
                      { key: "postType", label: "投稿タイプ", req: false, note: "「最新情報」等の日本語もOK。空ならSTANDARD" },
                      { key: "mediaUrl", label: "画像", req: false, note: "URL または画像アーカイブのファイル名" },
                      { key: "ctaType", label: "ボタン種別", req: false, note: "「詳細」等の日本語もOK" },
                      { key: "ctaUrl", label: "ボタンURL", req: false, note: "" },
                    ] as const
                  ).map((field) => (
                    <div key={field.key} className="flex items-center gap-3">
                      <label className="w-28 text-sm font-medium shrink-0">
                        {field.label}
                        {field.req && <span className="text-red-600">＊</span>}
                      </label>
                      <select
                        value={sheetMapping[field.key] ?? ""}
                        onChange={(e) =>
                          setSheetMapping((prev) => {
                            const next = { ...prev }
                            if (e.target.value) next[field.key] = e.target.value
                            else delete next[field.key]
                            return next
                          })
                        }
                        className="h-9 px-2 text-sm border rounded flex-1 min-w-0"
                      >
                        <option value="">（使わない）</option>
                        {sheetPreview?.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      {field.note && (
                        <span className="text-[11px] text-gray-400 w-44 shrink-0 hidden md:block">
                          {field.note}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* サンプルプレビュー */}
                {sheetPreview && sheetPreview.sampleRows.length > 0 && (
                  <div className="border rounded mb-4 overflow-x-auto">
                    <table className="text-xs w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          {sheetPreview.headers.map((h) => (
                            <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap border-b">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheetPreview.sampleRows.map((r, i) => (
                          <tr key={i} className="border-b last:border-b-0">
                            {sheetPreview.headers.map((h) => (
                              <td key={h} className="px-2 py-1.5 whitespace-nowrap max-w-[160px] truncate text-gray-600">
                                {String(r[h] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex justify-between gap-2">
                  <button
                    onClick={() => setSheetStep("url")}
                    disabled={importing}
                    className="h-10 px-6 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50"
                  >
                    ← 戻る
                  </button>
                  <button
                    onClick={handleSheetImport}
                    disabled={importing}
                    className="h-10 px-6 text-sm text-white bg-[#4a90e2] hover:bg-[#3a7cc8] rounded disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> 取り込み中…
                      </>
                    ) : (
                      "この対応づけで取り込む"
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
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
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
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
      setMediaUrls(duplicateFrom.imageUrl ? [duplicateFrom.imageUrl] : [])
      if (duplicateFrom.cta?.actionType) {
        setCtaType(duplicateFrom.cta.actionType)
        setCtaUrl(duplicateFrom.cta.url ?? "")
      }
      setStore(defaultLocationName ?? "")
    } else if (isOpen) {
      setTopicType("STANDARD")
      setTitle("")
      setSummary("")
      setMediaUrls([])
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

    // data:/blob: URL は巨大になりリクエスト上限を超えるため事前に弾く
    const badUrl = mediaUrls.find((u) => u.startsWith("data:") || u.startsWith("blob:"))
    if (badUrl) {
      onError(
        "画像が正しくアップロードされていません。画像を一度外し、「ファイル選択」から入れ直してください。"
      )
      return
    }

    setSubmitting(true)
    try {
      if (asDraft || timing === "scheduled") {
        // 予約 or 下書き（下書きは status='draft' で自動実行対象外）
        const scheduledFor = new Date(
          `${scheduledDate}T${scheduledTime}`
        ).toISOString()

        const body: Record<string, unknown> = {
          locationName: store,
          scheduledFor,
          summary: fullSummary,
          postType: topicType,
          draft: asDraft,
        }
        if (mediaUrls.length > 0) body.mediaUrls = mediaUrls
        if (callToAction) body.callToAction = callToAction

        const { ok, error } = await fetchJson("/api/scheduled-posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!ok) throw new Error(error ?? "保存に失敗しました")
        onSuccess(asDraft ? "下書きを保存しました" : "予約を作成しました")
      } else {
        // 即時
        const post: Record<string, unknown> = {
          languageCode: "ja",
          summary: fullSummary,
          topicType,
        }
        if (callToAction) post.callToAction = callToAction
        if (mediaUrls.length > 0) {
          post.media = mediaUrls.map((url) => ({
            mediaFormat: "PHOTO",
            sourceUrl: url,
          }))
        }
        const { ok, error } = await fetchJson("/api/gbp/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationName: store, post }),
        })
        if (!ok) throw new Error(error ?? "投稿に失敗しました")
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
                disabled={mediaUrls.length >= 1}
                className="text-sm text-[#4a90e2] border border-[#4a90e2] rounded px-4 h-9 hover:bg-blue-50 disabled:opacity-50"
              >
                ファイル選択
              </button>
              <span className="text-xs text-gray-500">
                {mediaUrls.length === 0
                  ? "選択されていません。（Googleの仕様により1投稿につき画像1枚・PCからアップロード可・自動リサイズ）"
                  : `${mediaUrls.length} / 1 枚`}
              </span>
            </div>
            {mediaUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {mediaUrls.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="w-20 h-20 rounded object-cover border"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setMediaUrls((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow hover:bg-red-600"
                      title="この画像を外す"
                    >
                      ×
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center rounded-b">
                        メイン
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
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
        maxCount={1 - mediaUrls.length}
        onSelect={(urls) =>
          setMediaUrls((prev) => [...prev, ...urls].slice(0, 1))
        }
      />
    </div>
  )
}
