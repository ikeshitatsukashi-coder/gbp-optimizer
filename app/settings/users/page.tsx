"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Users,
  ShieldCheck,
  Pencil,
  Eye,
  Trash2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react"

type Role = "admin" | "editor" | "viewer"

interface UserRow {
  email: string
  displayName: string | null
  role: Role
  disabled: boolean
  lastLoginAt: string | null
  createdAt: string
}

const ROLE_META: Record<
  Role,
  { label: string; desc: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  admin: {
    label: "管理者",
    desc: "全操作＋利用者管理・ワークフロー設定",
    icon: ShieldCheck,
    cls: "bg-purple-100 text-purple-700 border-purple-200",
  },
  editor: {
    label: "編集者",
    desc: "投稿・返信などの通常運用",
    icon: Pencil,
    cls: "bg-blue-100 text-blue-700 border-blue-200",
  },
  viewer: {
    label: "閲覧のみ",
    desc: "データの閲覧のみ（書き込み不可）",
    icon: Eye,
    cls: "bg-gray-100 text-gray-600 border-gray-200",
  },
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

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [me, setMe] = useState<{ email: string; role: Role } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [savingEmail, setSavingEmail] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/users")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setUsers(j.users)
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

  const patch = async (email: string, body: Record<string, unknown>) => {
    setSavingEmail(email)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...body }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setNotice(`${email} を更新しました`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingEmail(null)
    }
  }

  const remove = async (email: string) => {
    if (!confirm(`${email} を利用者一覧から削除します。\n（再ログインすると既定の「編集者」で再登録されます）`))
      return
    setSavingEmail(email)
    try {
      const res = await fetch(`/api/users?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingEmail(null)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-[#2c3e50]" />
            利用者・権限管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            li-go.jp のアカウントでログインした人がここに登録されます。権限を「閲覧のみ」にすると、
            投稿・返信・削除申請などの書き込み操作ができなくなります。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          更新
        </Button>
      </div>

      {/* 権限の説明 */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(["admin", "editor", "viewer"] as Role[]).map((r) => {
          const m = ROLE_META[r]
          const Icon = m.icon
          return (
            <Card key={r} className="p-3">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Icon className="h-4 w-4" />
                {m.label}
              </div>
              <p className="text-xs text-gray-500 mt-1">{m.desc}</p>
            </Card>
          )
        })}
      </div>

      {!isAdmin && !loading && (
        <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            権限の変更は管理者のみ可能です（現在のあなたの権限:{" "}
            {me ? ROLE_META[me.role].label : "—"}）。
          </span>
        </div>
      )}

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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">メールアドレス</th>
                <th className="px-3 py-2 font-medium w-40">権限</th>
                <th className="px-3 py-2 font-medium w-24">状態</th>
                <th className="px-3 py-2 font-medium w-40">最終ログイン</th>
                <th className="px-3 py-2 font-medium w-40">登録日</th>
                <th className="px-3 py-2 font-medium w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                    読込中…
                  </td>
                </tr>
              )}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    利用者がまだ登録されていません
                  </td>
                </tr>
              )}
              {users.map((u) => {
                const isMe = u.email === me?.email
                const busy = savingEmail === u.email
                return (
                  <tr key={u.email} className={u.disabled ? "bg-gray-50/70" : ""}>
                    <td className="px-3 py-2">
                      <div className="font-medium break-all">{u.email}</div>
                      {isMe && (
                        <span className="text-[11px] text-blue-600">（あなた）</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isAdmin ? (
                        <select
                          value={u.role}
                          disabled={busy}
                          onChange={(e) => patch(u.email, { role: e.target.value })}
                          className="w-full rounded border px-2 py-1 text-sm"
                        >
                          <option value="admin">管理者</option>
                          <option value="editor">編集者</option>
                          <option value="viewer">閲覧のみ</option>
                        </select>
                      ) : (
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-xs ${ROLE_META[u.role].cls}`}
                        >
                          {ROLE_META[u.role].label}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {u.disabled ? (
                        <span className="text-xs text-red-600">無効</span>
                      ) : (
                        <span className="text-xs text-green-700">有効</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{fmt(u.lastLoginAt)}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{fmt(u.createdAt)}</td>
                    <td className="px-3 py-2">
                      {isAdmin && !isMe && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => patch(u.email, { disabled: !u.disabled })}
                          >
                            {u.disabled ? "有効化" : "無効化"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => remove(u.email)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      )}
                      {busy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-gray-500">
        ※ ログインできるアカウント自体の制限（許可ドメイン・許可メール）は環境変数
        ALLOWED_EMAIL_DOMAIN / ALLOWED_EMAILS で管理しています。ここでは「ログインできる人が何をできるか」を設定します。
      </p>
    </div>
  )
}
