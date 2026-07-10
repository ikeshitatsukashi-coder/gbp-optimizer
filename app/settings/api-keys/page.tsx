"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  KeyRound,
  Plus,
  Copy,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  BookOpen,
} from "lucide-react"

interface ApiKeyRow {
  id: number
  name: string
  prefix: string
  createdBy: string | null
  lastUsedAt: string | null
  revoked: boolean
  createdAt: string
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  /** 作成直後の一度だけ表示されるキー */
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/api-keys")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setKeys(j.keys)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setCreatedKey({ name: j.name, key: j.key })
      setShowCreate(false)
      setNewName("")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: number, name: string) => {
    if (!confirm(`「${name}」を失効させますか？\nこのキーを使う連携は即座に動かなくなります。`)) {
      return
    }
    try {
      const res = await fetch(`/api/api-keys?id=${id}`, { method: "DELETE" })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const copyKey = async () => {
    if (!createdKey) return
    await navigator.clipboard.writeText(createdKey.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="h-6 w-6" />
            API連携（APIキー管理）
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            外部の AI アシスタントやスクリプトからこのツールを操作するための API キーを発行します。できるのは読み取りと「予約の作成」まで。Google への実投稿・返信はこの API からは実行できません。
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> 新規キー発行
        </Button>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {/* 作成直後のキー表示（一度だけ） */}
      {createdKey && (
        <Card className="p-4 bg-green-50 border-green-300">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-green-900 mb-2">
                「{createdKey.name}」のキーが発行されました。今すぐコピーしてください（この画面を閉じると二度と表示されません）
              </p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-white border rounded px-3 py-2 font-mono break-all flex-1">
                  {createdKey.key}
                </code>
                <Button size="sm" onClick={copyKey}>
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> コピー済み
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> コピー
                    </>
                  )}
                </Button>
              </div>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      )}

      {/* 使い方 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="h-4 w-4 text-[#4a90e2]" />
          <h2 className="text-sm font-bold">使い方</h2>
        </div>
        <div className="text-xs text-gray-600 space-y-2">
          <p>
            1. AI アシスタント（Claude 等）に OpenAPI 定義を渡す:{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded">
              https://gbp-optimizer-phi.vercel.app/api/ext/openapi
            </code>
          </p>
          <p>
            2. 発行したキーを Authorization ヘッダーで送るよう指示:{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded">
              Authorization: Bearer gbp_live_...
            </code>
          </p>
          <p>3. できること: 店舗一覧 / 診断スコア / クチコミ検索 / 予約投稿の一覧・作成（下書き含む）</p>
          <p className="text-gray-500">
            例（curl）:{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded break-all">
              curl -H &quot;Authorization: Bearer gbp_live_xxx&quot; https://gbp-optimizer-phi.vercel.app/api/ext/diagnosis
            </code>
          </p>
        </div>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
        </div>
      )}

      {/* キー一覧 */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">名前</th>
              <th className="text-left px-3 py-2 font-medium">キー</th>
              <th className="text-left px-3 py-2 font-medium">発行者</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">最終利用</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">発行日</th>
              <th className="text-left px-3 py-2 font-medium">状態</th>
              <th className="text-left px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                  APIキーがまだありません。「新規キー発行」から作成してください。
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id} className={`border-t ${k.revoked ? "opacity-50" : ""}`}>
                <td className="px-3 py-2 font-medium">{k.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{k.prefix}…</td>
                <td className="px-3 py-2 text-xs">{k.createdBy ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{formatDateTime(k.lastUsedAt)}</td>
                <td className="px-3 py-2 text-xs">{formatDateTime(k.createdAt)}</td>
                <td className="px-3 py-2">
                  {k.revoked ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                      失効済み
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                      有効
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {!k.revoked && (
                    <button
                      onClick={() => handleRevoke(k.id, k.name)}
                      className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" /> 失効
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* 作成モーダル */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
            <h2 className="text-lg font-bold mb-3">新規APIキー発行</h2>
            <label className="block text-sm font-medium mb-1">
              キーの名前（誰が何に使うか分かる名前）
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="例: 山田さん Chrome連携"
              className="w-full h-10 px-3 text-sm border rounded mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowCreate(false)}
                disabled={creating}
              >
                キャンセル
              </Button>
              <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
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
