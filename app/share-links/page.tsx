"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { normalizeSearchText } from "@/lib/search-normalize"
import {
  Loader2,
  Plus,
  Copy,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Ban,
  Share2,
} from "lucide-react"

interface LinkRow {
  id: number
  token: string
  name: string
  scopeType: string
  locationName: string | null
  parentCompany: string | null
  sections: string[]
  revoked: boolean
  createdAt: string
  updatedAt: string
  insightsCapturedAt: string | null
}
interface StoreRow {
  locationName: string
  title: string
  parentCompany: string | null
}

const SECTION_LABELS: Record<string, string> = {
  diagnosis: "診断スコア",
  reviews: "クチコミ",
  insights: "インサイト",
}

export default function ShareLinksPage() {
  const [links, setLinks] = useState<LinkRow[]>([])
  const [stores, setStores] = useState<StoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [refreshingId, setRefreshingId] = useState<number | null>(null)

  // 作成フォーム
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState("")
  const [scopeType, setScopeType] = useState<"store" | "company">("company")
  const [locationName, setLocationName] = useState("")
  const [parentCompany, setParentCompany] = useState("")
  const [sections, setSections] = useState<Set<string>>(
    new Set(["diagnosis", "reviews", "insights"])
  )
  const [storeSearch, setStoreSearch] = useState("")
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/share-links")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setLinks(j.links)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    fetch("/api/stores?status=active&limit=2000")
      .then((r) => r.json())
      .then((j) =>
        setStores(
          (j.stores ?? []).map((s: StoreRow) => ({
            locationName: s.locationName,
            title: s.title,
            parentCompany: s.parentCompany,
          }))
        )
      )
      .catch(() => {})
  }, [load])

  const companies = useMemo(() => {
    const set = new Set<string>()
    for (const s of stores) if (s.parentCompany?.trim()) set.add(s.parentCompany.trim())
    return [...set].sort((a, b) => a.localeCompare(b, "ja"))
  }, [stores])

  const filteredStores = storeSearch
    ? stores.filter((s) =>
        normalizeSearchText(s.title).includes(normalizeSearchText(storeSearch))
      )
    : stores

  const shareUrl = (token: string) => `${window.location.origin}/share/${token}`

  const create = async () => {
    setError(null)
    if (!name.trim()) {
      setError("リンク名を入力してください")
      return
    }
    if (scopeType === "store" && !locationName) {
      setError("店舗を選択してください")
      return
    }
    if (scopeType === "company" && !parentCompany) {
      setError("グループ（親会社）を選択してください")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scopeType,
          locationName: scopeType === "store" ? locationName : undefined,
          parentCompany: scopeType === "company" ? parentCompany : undefined,
          sections: [...sections],
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setShowCreate(false)
      setName("")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const refresh = async (id: number) => {
    setRefreshingId(id)
    try {
      const res = await fetch(`/api/share-links?id=${id}`, { method: "PATCH" })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshingId(null)
    }
  }

  const revoke = async (row: LinkRow) => {
    if (
      !confirm(
        `「${row.name}」を失効させますか？\nお客様はこのURLを開けなくなります（復活はできません）。`
      )
    )
      return
    const res = await fetch(`/api/share-links?id=${row.id}`, { method: "DELETE" })
    if (res.ok) await load()
  }

  const copyLink = async (row: LinkRow) => {
    await navigator.clipboard.writeText(shareUrl(row.token))
    setCopiedId(row.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Share2 className="h-6 w-6" />
            お客様共有ページ
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            お客様に見せる閲覧専用ページのリンクを発行します。URLを知っている人だけが閲覧でき、操作は一切できません。
            クチコミと診断スコアは常に最新、インサイトは発行/更新時点のデータです。
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> 新規リンク発行
        </Button>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">リンク名</th>
                <th className="text-left px-3 py-2 font-medium">対象</th>
                <th className="text-left px-3 py-2 font-medium">表示内容</th>
                <th className="text-left px-3 py-2 font-medium">URL</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">
                  インサイト時点
                </th>
                <th className="text-left px-3 py-2 font-medium">状態</th>
                <th className="text-left px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {links.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground">
                    共有リンクがまだありません。「新規リンク発行」から作成してください。
                  </td>
                </tr>
              )}
              {links.map((row) => (
                <tr key={row.id} className={`border-t ${row.revoked ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.scopeType === "company"
                      ? `グループ: ${row.parentCompany}`
                      : (stores.find((s) => s.locationName === row.locationName)?.title ??
                        row.locationName)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.sections.map((s) => SECTION_LABELS[s] ?? s).join(" / ")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <button
                        onClick={() => copyLink(row)}
                        className="text-xs text-[#4a90e2] hover:underline flex items-center gap-1"
                        disabled={row.revoked}
                      >
                        {copiedId === row.id ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-green-600" /> コピー済み
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> URLコピー
                          </>
                        )}
                      </button>
                      <a
                        href={`/share/${row.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-400 hover:text-gray-600 p-1"
                        title="プレビュー"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {row.sections.includes("insights")
                      ? row.insightsCapturedAt
                        ? new Date(row.insightsCapturedAt).toLocaleDateString("ja-JP")
                        : "未取得"
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {row.revoked ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">
                        失効済み
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                        有効
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {!row.revoked && (
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <button
                          onClick={() => refresh(row.id)}
                          disabled={refreshingId === row.id}
                          className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
                          title="インサイトデータを今の内容で更新"
                        >
                          {refreshingId === row.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          データ更新
                        </button>
                        <button
                          onClick={() => revoke(row)}
                          className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                        >
                          <Ban className="h-3 w-3" /> 失効
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* 作成モーダル */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">お客様共有リンクの発行</h2>

            <label className="block text-sm font-bold mb-1">リンク名（社内管理用）</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 辻水産様 月次レポート"
              className="w-full h-10 px-3 text-sm border rounded mb-4"
              autoFocus
            />

            <p className="text-sm font-bold mb-2">対象</p>
            <div className="flex gap-6 mb-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={scopeType === "company"}
                  onChange={() => setScopeType("company")}
                />
                グループ（親会社）単位
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={scopeType === "store"}
                  onChange={() => setScopeType("store")}
                />
                単店舗
              </label>
            </div>

            {scopeType === "company" ? (
              <select
                value={parentCompany}
                onChange={(e) => setParentCompany(e.target.value)}
                className="w-full h-10 px-2 text-sm border rounded mb-4"
              >
                <option value="">グループを選択してください</option>
                {companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <div className="border rounded p-3 mb-4">
                <input
                  type="text"
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                  placeholder="店舗名で検索（あいまい検索対応）"
                  className="w-full h-9 px-3 text-sm border rounded mb-2"
                />
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredStores.slice(0, 100).map((s) => (
                    <label
                      key={s.locationName}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
                    >
                      <input
                        type="radio"
                        checked={locationName === s.locationName}
                        onChange={() => setLocationName(s.locationName)}
                      />
                      {s.title}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <p className="text-sm font-bold mb-2">お客様に見せる内容</p>
            <div className="space-y-2 mb-4">
              {Object.entries(SECTION_LABELS).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sections.has(key)}
                    onChange={(e) => {
                      setSections((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(key)
                        else next.delete(key)
                        return next
                      })
                    }}
                  />
                  {label}
                  {key === "insights" && (
                    <span className="text-xs text-gray-400">
                      （発行時にデータ取得するため数十秒かかることがあります）
                    </span>
                  )}
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
                キャンセル
              </Button>
              <Button onClick={create} disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> 発行中…
                  </>
                ) : (
                  "発行する"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
