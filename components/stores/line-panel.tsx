"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Send, RefreshCw, CheckCircle2, AlertTriangle, Users } from "lucide-react"
import { fetchJsonRetry } from "@/lib/fetch-json"

/**
 * LINE公式アカウントの接続確認と友だち全員への配信。
 *
 * 配信は実際に相手のLINEへ届くため、送信前に必ず確認を挟む。
 */

interface Props {
  locationId: string
  connectionId: number
  onError: (msg: string) => void
}

interface VerifyResult {
  bot: { displayName: string; basicId: string; chatMode: string | null }
  quota: { type: string; limit: number | null; used: number | null } | null
  followers: number | null
  followersNote: string | null
}

interface BroadcastRow {
  id: number
  message: string
  imageUrl: string | null
  status: string
  errorMessage: string | null
  followers: number | null
  sentBy: string | null
  sentAt: string
}

const MAX_LEN = 5000

export function LinePanel({ locationId, connectionId, onError }: Props) {
  const [verifying, setVerifying] = useState(false)
  const [info, setInfo] = useState<VerifyResult | null>(null)

  const [message, setMessage] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  const [history, setHistory] = useState<BroadcastRow[]>([])

  const loadHistory = useCallback(async () => {
    const r = await fetchJsonRetry<{ broadcasts: BroadcastRow[] }>(
      `/api/line/broadcast?locationId=${encodeURIComponent(locationId)}`
    )
    if (r.ok) setHistory(r.data?.broadcasts ?? [])
  }, [locationId])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const verify = async () => {
    setVerifying(true)
    try {
      const r = await fetchJsonRetry<VerifyResult>("/api/line/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      })
      if (!r.ok) throw new Error(r.error ?? "接続確認に失敗しました")
      setInfo(r.data as VerifyResult)
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setVerifying(false)
    }
  }

  const send = async () => {
    const body = message.trim()
    if (!body) {
      onError("配信する本文を入力してください")
      return
    }

    // 友だち全員に届くため、送信前に対象と本文を明示して確認する
    const target =
      info?.followers != null
        ? `友だち ${info.followers} 人`
        : "友だち全員（人数は未取得）"
    const preview = body.length > 120 ? `${body.slice(0, 120)}…` : body
    const ok = confirm(
      `${target}のLINEに、以下の内容が今すぐ届きます。送信してよろしいですか？\n\n` +
        `${preview}\n\n` +
        `※送信の取り消しはできません。`
    )
    if (!ok) return

    setSending(true)
    setSent(null)
    try {
      const r = await fetchJsonRetry<{ followers: number | null }>("/api/line/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          message: body,
          imageUrl: imageUrl.trim() || undefined,
          // 同じ配信が二重に飛ばないようにする（LINE側で冪等になる）
          retryKey: crypto.randomUUID(),
        }),
      })
      if (!r.ok) throw new Error(r.error ?? "配信に失敗しました")
      setSent("配信しました")
      setMessage("")
      setImageUrl("")
      await loadHistory()
      setTimeout(() => setSent(null), 4000)
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
      await loadHistory()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mt-4 border-t pt-4 space-y-4">
      {/* 接続確認 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={verify} disabled={verifying}>
          {verifying ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 確認中…
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" /> 接続を確認する
            </>
          )}
        </Button>
        {info && (
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <span className="inline-flex items-center gap-1 text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {info.bot.displayName}（{info.bot.basicId}）
            </span>
            {info.followers != null && (
              <span className="inline-flex items-center gap-1 text-gray-600">
                <Users className="h-3.5 w-3.5" />
                友だち {info.followers} 人
              </span>
            )}
            {info.quota && (
              <span className="text-gray-600">
                当月の送信 {info.quota.used ?? "—"}
                {info.quota.type === "limited" && info.quota.limit != null
                  ? ` / ${info.quota.limit} 通`
                  : " 通（上限なし）"}
              </span>
            )}
          </div>
        )}
      </div>
      {info?.followersNote && (
        <p className="text-xs text-gray-500">{info.followersNote}</p>
      )}

      {/* 配信 */}
      <div className="space-y-2">
        <label className="block text-sm font-bold">友だち全員へ配信</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={MAX_LEN}
          placeholder={"例\n本日は17時まで営業しております。\nご来店お待ちしております。"}
          className="w-full px-3 py-2 text-sm border rounded"
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="画像URL（任意・https:// のみ）"
            className="h-9 px-3 text-sm border rounded flex-1 min-w-[240px]"
          />
          <span className="text-xs text-gray-500">
            {message.length} / {MAX_LEN} 文字
          </span>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-900 leading-relaxed">
            押すと<b>友だち全員のLINEに即座に届きます</b>（取り消しできません）。
            送信前に確認画面が出ます。
          </p>
        </div>

        <div className="flex items-center justify-end gap-3">
          {sent && (
            <span className="text-xs text-green-700 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {sent}
            </span>
          )}
          <Button onClick={send} disabled={sending || !message.trim()}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> 送信中…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> 配信する
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 履歴 */}
      {history.length > 0 && (
        <div>
          <p className="text-sm font-bold mb-2">配信履歴</p>
          <div className="border rounded divide-y max-h-64 overflow-y-auto">
            {history.map((h) => (
              <div key={h.id} className="px-3 py-2 text-xs">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      h.status === "sent"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {h.status === "sent" ? "送信済み" : "失敗"}
                  </span>
                  <span className="text-gray-500">
                    {new Date(h.sentAt).toLocaleString("ja-JP")}
                  </span>
                  {h.followers != null && (
                    <span className="text-gray-500">友だち {h.followers} 人</span>
                  )}
                  {h.sentBy && <span className="text-gray-400 truncate">{h.sentBy}</span>}
                </div>
                <p className="whitespace-pre-wrap text-gray-800">{h.message}</p>
                {h.errorMessage && (
                  <p className="text-red-600 mt-0.5">{h.errorMessage}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
