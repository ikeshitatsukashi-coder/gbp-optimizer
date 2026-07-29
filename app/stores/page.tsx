"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Store } from "@/lib/db/schema"

type StoreRow = Omit<Store, "address"> & { address: Record<string, unknown> | null }

interface SyncResult {
  accountsProcessed: number
  locationsFetched: number
  inserted: number
  updated: number
  errors: { accountName: string; error: string }[]
  durationMs: number
}

const INDUSTRY_LABELS: Record<string, string> = {
  btob_logistics: "BtoB物流",
  bakery: "ベーカリー",
  funeral: "葬祭",
  restaurant: "飲食",
  construction: "建設・不動産",
  staffing: "人材派遣",
  buyback: "買取・質屋",
  general_btoc: "BtoC一般",
  general_btob: "BtoB一般",
}

const STATUS_LABELS: Record<string, string> = {
  active: "運用中",
  paused: "休止",
  archived: "解約",
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  archived: "bg-gray-100 text-gray-600",
}

function formatAddress(addr: Record<string, unknown> | null): string {
  if (!addr) return ""
  const region = (addr.administrativeArea as string) ?? ""
  const locality = (addr.locality as string) ?? ""
  const sub = (addr.sublocality as string) ?? ""
  const lines = (addr.addressLines as string[]) ?? []
  return `${region}${locality}${sub} ${lines.join(" ")}`.trim()
}

export default function StoresPage() {
  const [stores, setStores] = useState<StoreRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // フィルタ
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [industryFilter, setIndustryFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState<string>("")

  const fetchStores = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (industryFilter !== "all") params.set("industry", industryFilter)
      if (searchQuery.trim()) params.set("q", searchQuery.trim())
      params.set("limit", "1000")

      const res = await fetch(`/api/stores?${params.toString()}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setStores(data.stores)
      setTotal(data.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [statusFilter, industryFilter, searchQuery])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  const runSync = async () => {
    setSyncing(true)
    setError(null)
    setLastSyncResult(null)
    try {
      const res = await fetch("/api/stores/sync", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setLastSyncResult(data.result)
      await fetchStores()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  const updateStore = async (locationName: string, patch: Partial<StoreRow>) => {
    const locationId = locationName.replace(/^locations\//, "")
    try {
      const res = await fetch(`/api/stores/${locationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setStores((prev) =>
        prev.map((s) => (s.locationName === locationName ? data.store : s))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // 集計
  const summary = useMemo(() => {
    const byStatus: Record<string, number> = { active: 0, paused: 0, archived: 0 }
    let autoReplyOn = 0
    let autoFlagOn = 0
    for (const s of stores) {
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1
      if (s.autoReplyEnabled) autoReplyOn += 1
      if (s.autoFlagEnabled) autoFlagOn += 1
    }
    return { byStatus, autoReplyOn, autoFlagOn }
  }, [stores])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">店舗マスタ</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Google Business Profile に登録された店舗を取り込み、業種・運用ステータス・自動化フラグを管理します。
          </p>
        </div>
        <Button onClick={runSync} disabled={syncing} size="lg">
          {syncing ? "同期中…" : "Google から同期"}
        </Button>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">
            <strong>エラー:</strong> {error}
          </p>
        </Card>
      )}

      {lastSyncResult && (
        <Card className="p-4 bg-green-50 border-green-200">
          <p className="text-sm text-green-900">
            <strong>同期完了</strong>（{(lastSyncResult.durationMs / 1000).toFixed(1)}秒）:
            アカウント {lastSyncResult.accountsProcessed} 件、店舗{" "}
            {lastSyncResult.locationsFetched} 件取得 / 新規 {lastSyncResult.inserted} 件、更新{" "}
            {lastSyncResult.updated} 件
            {lastSyncResult.errors.length > 0 && (
              <>, エラー {lastSyncResult.errors.length} 件</>
            )}
          </p>
        </Card>
      )}

      {/* 集計サマリー */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">全店舗</div>
          <div className="text-2xl font-bold mt-1">{total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">運用中</div>
          <div className="text-2xl font-bold mt-1 text-green-700">
            {summary.byStatus.active}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">休止</div>
          <div className="text-2xl font-bold mt-1 text-yellow-700">
            {summary.byStatus.paused}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">自動返信ON</div>
          <div className="text-2xl font-bold mt-1 text-blue-700">
            {summary.autoReplyOn}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">自動削除申請ON</div>
          <div className="text-2xl font-bold mt-1 text-purple-700">
            {summary.autoFlagOn}
          </div>
        </Card>
      </div>

      {/* フィルタ */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              ステータス
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-8 px-2 text-sm border rounded-md bg-background"
            >
              <option value="all">全件</option>
              <option value="active">運用中</option>
              <option value="paused">休止</option>
              <option value="archived">解約</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">業種</label>
            <select
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
              className="w-full h-8 px-2 text-sm border rounded-md bg-background"
            >
              <option value="all">全件</option>
              {Object.entries(INDUSTRY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground block mb-1">
              検索（店名・電話・親会社）
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="例: 株式会社LIGO / 03-xxxx / 丸進運輸"
              className="w-full h-8 px-2 text-sm border rounded-md bg-background"
            />
          </div>
        </div>
      </Card>

      {/* テーブル */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">読み込み中…</div>
        ) : stores.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {total === 0
              ? "店舗がまだ取り込まれていません。「Google から同期」ボタンを押してください。"
              : "該当する店舗がありません。フィルタを変更してください。"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">店舗名</th>
                  <th className="text-left px-3 py-2 font-medium">住所</th>
                  <th className="text-left px-3 py-2 font-medium">業種</th>
                  <th className="text-left px-3 py-2 font-medium">ステータス</th>
                  <th className="text-center px-3 py-2 font-medium">自動返信</th>
                  <th className="text-center px-3 py-2 font-medium">自動削除申請</th>
                  <th className="text-center px-3 py-2 font-medium">詳細</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.locationName} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <a
                        href={`/stores/${s.locationName.replace(/^locations\//, "")}`}
                        className="font-medium text-[#4a90e2] hover:underline"
                      >
                        {s.title}
                      </a>
                      <div className="text-xs text-muted-foreground">
                        {s.primaryCategory ?? ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatAddress(s.address)}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={s.industry}
                        onChange={(e) =>
                          updateStore(s.locationName, {
                            industry: e.target.value as StoreRow["industry"],
                          })
                        }
                        className="h-7 px-2 text-xs border rounded bg-background"
                      >
                        {Object.entries(INDUSTRY_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={s.status}
                        onChange={(e) =>
                          updateStore(s.locationName, {
                            status: e.target.value as StoreRow["status"],
                          })
                        }
                        className={`h-7 px-2 text-xs border rounded ${STATUS_BADGE[s.status]}`}
                      >
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={s.autoReplyEnabled}
                        onChange={(e) =>
                          updateStore(s.locationName, {
                            autoReplyEnabled: e.target.checked,
                          })
                        }
                        className="h-4 w-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={s.autoFlagEnabled}
                        onChange={(e) =>
                          updateStore(s.locationName, {
                            autoFlagEnabled: e.target.checked,
                          })
                        }
                        className="h-4 w-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <a
                        href={`/stores/${s.locationName.replace(/^locations\//, "")}`}
                        className="text-xs text-[#4a90e2] hover:underline whitespace-nowrap"
                        title="基本情報・SNS連携・通知設定"
                      >
                        設定 →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        ※ 店舗名・住所・電話番号は Google から自動同期されます。店舗名または「設定 →」から、店舗ごとのSNS連携・クチコミ通知などの詳細設定に進めます。
      </p>
    </div>
  )
}
