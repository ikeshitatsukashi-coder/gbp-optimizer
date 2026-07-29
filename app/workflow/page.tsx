"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  ClipboardCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ThumbsUp,
  Undo2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react"

type Status = "pending" | "approved" | "rejected"

interface RequestRow {
  id: number
  targetType: string
  targetId: number
  summary: string | null
  locationName: string | null
  status: Status
  requestedBy: string | null
  requestedAt: string
  decidedBy: string | null
  decidedAt: string | null
  comment: string | null
  storeTitle: string | null
  scheduledFor: string | null
  postStatus: string | null
}

const TABS: Array<{ key: Status; label: string }> = [
  { key: "pending", label: "承認待ち" },
  { key: "approved", label: "承認済み" },
  { key: "rejected", label: "差し戻し" },
]

const STATUS_CLS: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
}
const STATUS_LABEL: Record<Status, string> = {
  pending: "承認待ち",
  approved: "承認済み",
  rejected: "差し戻し",
}

function fmt(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function WorkflowPage() {
  const [rows, setRows] = useState<RequestRow[]>([])
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 })
  const [workflowRequired, setWorkflowRequired] = useState(false)
  const [me, setMe] = useState<{ email: string; role: string } | null>(null)
  const [tab, setTab] = useState<Status>("pending")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/approvals")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setRows(j.requests)
      setCounts(j.counts)
      setWorkflowRequired(j.workflowRequired)
      setMe(j.me)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const isAdmin = me?.role === "admin"
  const visible = useMemo(() => rows.filter((r) => r.status === tab), [rows, tab])

  useEffect(() => {
    setSelected(new Set())
  }, [tab])

  const post = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setNotice(okMsg)
      setSelected(new Set())
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const decide = (action: "approve" | "reject", ids: number[]) => {
    if (ids.length === 0) return
    const verb = action === "approve" ? "承認" : "差し戻し"
    if (!confirm(`${ids.length}件を${verb}します。よろしいですか？`)) return
    post({ action, ids }, `${ids.length}件を${verb}しました`)
  }

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(visible.map((r) => r.id)) : new Set())
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-[#2c3e50]" />
            ワークフロー承認
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            予約投稿を「承認制」にできます。ONにすると、承認されるまで予約時刻が来ても投稿されません。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          更新
        </Button>
      </div>

      {/* ワークフローのON/OFF */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-sm">
              予約投稿の承認を必須にする
            </div>
            <p className="text-xs text-gray-500 mt-1 max-w-xl">
              ONの場合、予約投稿は承認待ちのまま保留され、承認された投稿だけがGoogleビジネスプロフィールへ送信されます。
              OFF（既定）では従来どおり予約時刻に自動投稿されます。
            </p>
          </div>
          <button
            type="button"
            disabled={!isAdmin || busy}
            onClick={() =>
              post(
                { action: "set_workflow", required: !workflowRequired },
                `承認必須を${!workflowRequired ? "ON" : "OFF"}にしました`
              )
            }
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              workflowRequired
                ? "border-green-300 bg-green-50 text-green-700"
                : "border-gray-300 bg-gray-50 text-gray-600"
            } ${!isAdmin ? "opacity-60 cursor-not-allowed" : "hover:brightness-95"}`}
          >
            {workflowRequired ? (
              <ToggleRight className="h-5 w-5" />
            ) : (
              <ToggleLeft className="h-5 w-5" />
            )}
            {workflowRequired ? "承認必須：ON" : "承認必須：OFF"}
          </button>
        </div>
        {!isAdmin && (
          <p className="text-xs text-amber-700 mt-2">
            設定の変更は管理者のみ可能です（現在の権限では閲覧のみ）。
          </p>
        )}
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* タブ */}
      <div className="flex items-center gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.key
                ? "border-[#2c3e50] text-[#2c3e50]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}（{counts[t.key]}）
          </button>
        ))}
      </div>

      {/* 一括操作 */}
      {isAdmin && tab === "pending" && visible.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={busy || selected.size === 0}
            onClick={() => decide("approve", [...selected])}
          >
            <ThumbsUp className="h-4 w-4 mr-1" />
            選択を承認（{selected.size}）
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || selected.size === 0}
            onClick={() => decide("reject", [...selected])}
          >
            <Undo2 className="h-4 w-4 mr-1" />
            選択を差し戻し
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                {isAdmin && tab === "pending" && (
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={visible.length > 0 && selected.size === visible.length}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                )}
                <th className="px-3 py-2 font-medium w-48 whitespace-nowrap">店舗</th>
                <th className="px-3 py-2 font-medium">投稿内容</th>
                <th className="px-3 py-2 font-medium w-36 whitespace-nowrap">投稿予定</th>
                <th className="px-3 py-2 font-medium w-24 whitespace-nowrap">状態</th>
                <th className="px-3 py-2 font-medium w-40 whitespace-nowrap">申請者 / 申請日</th>
                <th className="px-3 py-2 font-medium w-40 whitespace-nowrap">決裁者 / 決裁日</th>
                {isAdmin && <th className="px-3 py-2 font-medium w-40 whitespace-nowrap"></th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                    読込中…
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-gray-500">
                    {tab === "pending"
                      ? "承認待ちの申請はありません。投稿スケジューラの「WF承認」列から申請できます。"
                      : "該当する申請はありません"}
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <tr key={r.id} className="align-top">
                  {isAdmin && tab === "pending" && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={(e) => {
                          const next = new Set(selected)
                          e.target.checked ? next.add(r.id) : next.delete(r.id)
                          setSelected(next)
                        }}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="font-medium whitespace-nowrap">{r.storeTitle ?? "（不明な店舗）"}</div>
                    <div className="text-[11px] text-gray-400">#{r.targetId}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="whitespace-pre-wrap break-words text-gray-700 line-clamp-3">
                      {r.summary ?? "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {fmt(r.scheduledFor)}
                    {r.postStatus === "posted" && (
                      <div className="text-[11px] text-green-700">投稿済み</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs ${STATUS_CLS[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    <div className="break-all">{r.requestedBy ?? "—"}</div>
                    <div className="text-gray-400">{fmt(r.requestedAt)}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    <div className="break-all">{r.decidedBy ?? "—"}</div>
                    <div className="text-gray-400">{fmt(r.decidedAt)}</div>
                    {r.comment && (
                      <div className="text-gray-500 mt-1">「{r.comment}」</div>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2">
                      {r.status === "pending" ? (
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => decide("approve", [r.id])}
                          >
                            承認
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => decide("reject", [r.id])}
                          >
                            差し戻し
                          </Button>
                        </div>
                      ) : r.status === "rejected" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => decide("approve", [r.id])}
                        >
                          承認に変更
                        </Button>
                      ) : null}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-gray-500">
        ※ 不正防止のため、自分が申請した投稿を自分で承認することはできません（別の管理者が承認してください）。
      </p>
    </div>
  )
}
