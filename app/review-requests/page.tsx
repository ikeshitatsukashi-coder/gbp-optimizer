"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { normalizeSearchText } from "@/lib/search-normalize"
import {
  Loader2,
  AlertCircle,
  Mail,
  Search,
  Upload,
  CheckCircle2,
  ExternalLink,
  Info,
} from "lucide-react"

/* -------------------------------------------------------------------------- */
/*  クチコミ依頼（メール） — 来店したお客様にアンケート/クチコミURLをメール送信   */
/* -------------------------------------------------------------------------- */

interface StoreOption {
  locationName: string
  title: string
}
interface SurveyOption {
  id: number
  name: string
}
interface Recipient {
  name: string
  email: string
}
interface HistoryRow {
  id: number
  storeTitle: string
  urlType: string
  subject: string
  sentCount: number
  failCount: number
  status: string
  results: { email: string; ok: boolean; error?: string; previewUrl?: string }[] | null
  createdAt: string
}

const DEFAULT_SUBJECT = "【%StoreName%】アンケートご協力のお願い"
const DEFAULT_BODY = `%ClientName%様

この度はご利用いただき誠にありがとうございます。
サービス向上のため、よろしければ以下のURLよりアンケートにご協力ください。
%KutikomiURL%

%StoreName%`

export default function ReviewRequestsPage() {
  const [stores, setStores] = useState<StoreOption[]>([])
  const [surveyList, setSurveyList] = useState<SurveyOption[]>([])
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [mailConfigured, setMailConfigured] = useState<boolean | null>(null)

  const [locationName, setLocationName] = useState("")
  const [storeSearch, setStoreSearch] = useState("")
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [bodyText, setBodyText] = useState(DEFAULT_BODY)
  const [urlType, setUrlType] = useState<"survey" | "google" | "none">("survey")
  const [surveyId, setSurveyId] = useState<number | null>(null)
  const [recipientsText, setRecipientsText] = useState("")

  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [lastPreviews, setLastPreviews] = useState<string[]>([])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/review-requests")
      const j = await res.json()
      if (res.ok) {
        setHistory(j.requests)
        setMailConfigured(j.mailConfigured)
      }
    } catch {
      /* noop */
    }
  }, [])

  useEffect(() => {
    loadHistory()
    fetch("/api/stores?status=active&limit=2000")
      .then((r) => r.json())
      .then((j) =>
        setStores(
          (j.stores ?? []).map((s: StoreOption) => ({
            locationName: s.locationName,
            title: s.title,
          }))
        )
      )
      .catch(() => {})
    fetch("/api/surveys")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.surveys ?? [])
          .filter((s: { status: string }) => s.status === "active")
          .map((s: { id: number; name: string }) => ({ id: s.id, name: s.name }))
        setSurveyList(list)
        if (list.length > 0) setSurveyId(list[0].id)
      })
      .catch(() => {})
  }, [loadHistory])

  /** テキスト欄から宛先をパース（1行1件: 「名前,メール」または「メール」のみ） */
  const recipients: Recipient[] = useMemo(() => {
    return recipientsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,、\t]/).map((p) => p.trim())
        if (parts.length >= 2 && parts[1].includes("@")) {
          return { name: parts[0], email: parts[1] }
        }
        if (parts[0].includes("@")) return { name: "", email: parts[0] }
        return { name: parts[0], email: parts[1] ?? "" }
      })
      .filter((r) => r.email)
  }, [recipientsText])

  /** Excel（氏名/メール列）から宛先を読み込み */
  const handleExcel = async (file: File) => {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
    const nameKeys = ["名前", "氏名", "お名前", "name", "Name"]
    const emailKeys = ["メール", "メールアドレス", "email", "Email", "E-mail", "mail"]
    const lines: string[] = []
    for (const row of rows) {
      const nameKey = Object.keys(row).find((k) => nameKeys.includes(k.trim()))
      const emailKey = Object.keys(row).find((k) => emailKeys.includes(k.trim()))
      const email = emailKey ? String(row[emailKey] ?? "").trim() : ""
      if (!email) continue
      const name = nameKey ? String(row[nameKey] ?? "").trim() : ""
      lines.push(name ? `${name},${email}` : email)
    }
    if (lines.length === 0) {
      setError("Excelから宛先を読み取れませんでした。「氏名」「メールアドレス」列が必要です。")
      return
    }
    setRecipientsText((prev) => (prev.trim() ? prev.trimEnd() + "\n" : "") + lines.join("\n"))
  }

  const send = async () => {
    setError(null)
    setDoneMessage(null)
    setLastPreviews([])
    if (!locationName) {
      setError("店舗を選択してください")
      return
    }
    if (recipients.length === 0) {
      setError("宛先を入力してください")
      return
    }
    if (
      !confirm(
        `${recipients.length}件のお客様にメールを送信します。よろしいですか？\n\n送信元: ${
          mailConfigured ? "設定済みSMTP" : "テスト送信（実際には届きません）"
        }`
      )
    )
      return

    setSending(true)
    try {
      const res = await fetch("/api/review-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationName,
          urlType,
          surveyId: urlType === "survey" ? surveyId : undefined,
          subject,
          body: bodyText,
          recipients,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setDoneMessage(`送信完了: 成功 ${j.sentCount} 件 / 失敗 ${j.failCount} 件`)
      const previews = (j.results ?? [])
        .map((r: { previewUrl?: string }) => r.previewUrl)
        .filter(Boolean)
      setLastPreviews(previews)
      setRecipientsText("")
      await loadHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  const filteredStores = storeSearch
    ? stores.filter((s) =>
        normalizeSearchText(s.title).includes(normalizeSearchText(storeSearch))
      )
    : stores

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6" />
          クチコミ依頼（メール）
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          来店（来院）されたお客様へのメールにてクチコミ依頼ができます。送信は担当者がこの画面から都度実行します（自動送信はしません）。
        </p>
      </div>

      {/* SMTP設定状態 */}
      {mailConfigured === false && (
        <Card className="p-4 bg-amber-50 border-amber-300 flex items-start gap-2">
          <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-900">
            <p className="font-bold mb-1">メール送信の設定が未完了です</p>
            <p className="text-xs leading-relaxed">
              Vercel の環境変数に以下を設定すると本送信できるようになります（お名前.com
              のコントロールパネル「サーバー情報」でSMTPサーバー名を確認してください）。
              <br />
              <code className="bg-white/70 px-1 rounded">SMTP_HOST</code>（例:
              mailXX.onamae.ne.jp）／
              <code className="bg-white/70 px-1 rounded">SMTP_PORT</code>（465）／
              <code className="bg-white/70 px-1 rounded">SMTP_USER</code>
              （meo-support@li-go.jp 等のメールアドレス）／
              <code className="bg-white/70 px-1 rounded">SMTP_PASS</code>
              （メールのパスワード）／
              <code className="bg-white/70 px-1 rounded">MAIL_FROM_NAME</code>（送信者名）
              <br />
              ※パスワードはチャット等に送らず、Vercel の Environment Variables
              画面で直接入力してください。
            </p>
          </div>
        </Card>
      )}

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}
      {doneMessage && (
        <Card className="p-4 bg-green-50 border-green-300">
          <p className="text-sm text-green-900 font-bold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> {doneMessage}
          </p>
          {lastPreviews.length > 0 && (
            <div className="mt-2 text-xs text-green-800">
              テスト送信プレビュー:{" "}
              {lastPreviews.map((u, i) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="underline mr-2 inline-flex items-center gap-0.5"
                >
                  メール{i + 1} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="p-5 space-y-5">
        {/* 店舗選択 */}
        <div>
          <p className="text-sm font-bold mb-2">店舗を選択（必須）</p>
          <div className="relative mb-2 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
              placeholder="店舗名で絞り込み（あいまい検索対応）"
              className="w-full h-9 pl-8 pr-3 text-sm border rounded"
            />
          </div>
          <select
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            className="h-10 px-2 text-sm border rounded w-full max-w-md"
          >
            <option value="">選択してください</option>
            {filteredStores.map((s) => (
              <option key={s.locationName} value={s.locationName}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        {/* 件名・本文 */}
        <div>
          <label className="block text-sm font-bold mb-1">件名</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full h-10 px-3 text-sm border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-bold mb-1">本文</label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 text-sm border rounded font-mono"
          />
        </div>

        {/* プレースホルダ説明 */}
        <div className="bg-blue-50 border border-blue-100 rounded p-3 text-xs text-blue-900 leading-relaxed">
          <p className="font-bold mb-1 flex items-center gap-1">
            <Info className="h-3.5 w-3.5" /> ご確認ください
          </p>
          {"{ClientName} → 送信先名が入ります。本文の %ClientName%様 は消さずそのままご設定ください。"}
          <br />
          {"{KutikomiURL} → アンケート/クチコミURLが自動で入ります。{StoreName} → 店舗名が自動で入ります。"}
        </div>

        {/* URLタイプ */}
        <div>
          <p className="text-sm font-bold mb-2">URLタイプ</p>
          <div className="flex gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={urlType === "survey"}
                onChange={() => setUrlType("survey")}
              />
              アンケートURL
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={urlType === "google"}
                onChange={() => setUrlType("google")}
              />
              Googleクチコミ画面
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={urlType === "none"}
                onChange={() => setUrlType("none")}
              />
              選択なし
            </label>
          </div>
          {urlType === "survey" && (
            <div className="mt-2">
              <label className="block text-xs text-muted-foreground mb-1">対象アンケート名</label>
              <select
                value={surveyId ?? ""}
                onChange={(e) => setSurveyId(Number(e.target.value))}
                className="h-9 px-2 text-sm border rounded min-w-64"
              >
                {surveyList.length === 0 && <option value="">公開中のアンケートがありません</option>}
                {surveyList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 宛先 */}
        <div>
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <label className="text-sm font-bold">
              宛先リスト（1行1件: 「名前,メールアドレス」）— 現在 {recipients.length} 件 / 最大50件
            </label>
            <label className="text-xs text-[#4a90e2] hover:underline cursor-pointer flex items-center gap-1">
              <Upload className="h-3.5 w-3.5" /> Excelから読み込み（氏名・メールアドレス列）
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleExcel(f)
                  e.target.value = ""
                }}
              />
            </label>
          </div>
          <textarea
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            rows={6}
            placeholder={"山田太郎,yamada@example.com\n佐藤花子,sato@example.com"}
            className="w-full px-3 py-2 text-sm border rounded font-mono"
          />
        </div>

        <div className="flex justify-center">
          <Button onClick={send} disabled={sending} className="min-w-44">
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> 送信中…
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" /> 送信（{recipients.length}件）
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* 送信履歴 */}
      <Card className="overflow-x-auto">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-bold">クチコミ依頼一覧（送信履歴）</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">NO</th>
              <th className="text-left px-3 py-2 font-medium">件名</th>
              <th className="text-left px-3 py-2 font-medium">店舗</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">URLタイプ</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">送信日</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">成功/失敗</th>
              <th className="text-left px-3 py-2 font-medium">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted-foreground">
                  まだ送信履歴がありません
                </td>
              </tr>
            )}
            {history.map((h, i) => (
              <tr key={h.id} className="border-t">
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2 max-w-[240px] truncate">{h.subject}</td>
                <td className="px-3 py-2 text-xs">{h.storeTitle}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {h.urlType === "survey"
                    ? "アンケート"
                    : h.urlType === "google"
                      ? "Googleクチコミ"
                      : "なし"}
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {new Date(h.createdAt).toLocaleString("ja-JP", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <span className="text-green-700">{h.sentCount}</span> /{" "}
                  <span className={h.failCount > 0 ? "text-red-600" : "text-gray-400"}>
                    {h.failCount}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                      h.status === "done"
                        ? "bg-green-100 text-green-700"
                        : h.status === "partial"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {h.status === "done" ? "送信完了" : h.status === "partial" ? "一部失敗" : "失敗"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
