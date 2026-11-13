"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { fetchJson } from "@/lib/fetch-json"
import {
  DRAFT_SOURCE_LABEL,
  fmtDay,
  postReply,
  saveReplyDraft,
  stars,
} from "@/lib/review-reply-client"
import { AlertCircle, BellRing, CheckCircle2, Loader2, RefreshCw } from "lucide-react"

/**
 * 低評価クチコミのお知らせ。
 *
 * 投稿を登録している店舗に、星1〜2のクチコミが新しく付いたら、返信案つきでここに並ぶ。
 * - 確認は Google から読むだけ。クチコミの取り込み結果には書き込まない。
 * - 返信の投稿も、お客様へのメールも、担当がボタンを押した時だけ行う。
 */

interface Notice {
  reviewName: string
  locationName: string
  storeTitle: string
  storeEmail: string | null
  reviewer: string | null
  starRating: number
  comment: string | null
  reviewCreateTime: string | null
  detectedAt: string | null
  status: string
  notifiedAt: string | null
  notifiedTo: string | null
  draft: string
  draftSource: string | null
  draftStatus: string | null
}
interface LastCheck {
  at: string
  by: string
  checkedStores: number
  found: number
  errors: number
  authFailed?: boolean
}
interface Data {
  lookbackDays: number
  lastCheck: LastCheck | null
  notifyEmail: string
  mailReady: boolean
  aiReady: boolean
  notices: Notice[]
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** お客様に送る連絡文の初期値。担当が直してから使う */
function clientMessage(n: Notice, draft: string) {
  const day = n.reviewCreateTime
    ? new Date(n.reviewCreateTime).toLocaleDateString("ja-JP", { month: "long", day: "numeric" })
    : ""
  return {
    subject: `【ご確認のお願い】Googleクチコミへの返信案（${n.storeTitle}様）`,
    body: `${n.storeTitle} ご担当者様

いつもお世話になっております。
Googleのクチコミに新しい投稿がありましたので、お知らせいたします。

投稿日：${day}
評価：星${n.starRating}つ
投稿者：${n.reviewer ?? "匿名"}
内容：
${n.comment ?? "（コメントはありません）"}

返信の案をご用意しました。

――――――――――
${draft}
――――――――――

内容をご確認のうえ、修正のご希望がありましたらお知らせください。
ご確認いただけましたら、こちらで返信を投稿いたします。
`,
  }
}

function NoticeCard({
  n,
  mailReady,
  onChanged,
  onError,
}: {
  n: Notice
  mailReady: boolean
  onChanged: () => void
  onError: (m: string | null) => void
}) {
  const [draft, setDraft] = useState(n.draft)
  const [saved, setSaved] = useState(n.draft)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [mailOpen, setMailOpen] = useState(false)
  const [to, setTo] = useState(n.storeEmail ?? "")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [copied, setCopied] = useState(false)

  const replied = n.draftStatus === "posted"

  const save = async () => {
    if (draft === saved) return
    const err = await saveReplyDraft(n.reviewName, n.locationName, draft)
    if (err) onError(err)
    else setSaved(draft)
  }

  const makeDraft = async () => {
    setBusy("draft")
    onError(null)
    const r = await fetchJson<{ drafts: { reviewName: string; draft: string }[] }>(
      "/api/review-replies",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", items: [{ reviewName: n.reviewName }] }),
      }
    )
    setBusy(null)
    const d = r.data?.drafts?.[0]?.draft
    if (!r.ok || !d) {
      onError(r.error ?? "返信案を作れませんでした")
      return
    }
    setDraft(d)
    setSaved(d)
  }

  const approve = async () => {
    if (!draft.trim()) return
    if (
      !confirm(
        `この返信を「${n.storeTitle}」のクチコミに投稿します。\n\n投稿すると、Google の検索・マップで誰でも見られるようになります。\nよろしいですか？`
      )
    )
      return
    setBusy("post")
    onError(null)
    setNote(null)
    const r = await postReply(n.reviewName, n.locationName, draft)
    setBusy(null)
    if (!r.ok) {
      onError(r.error)
      return
    }
    if (r.status === "already") {
      setNote("このクチコミには、すでに返信が付いていました。上書きはしていません。")
    } else if (r.status === "gone") {
      setNote("このクチコミは、Google から削除されていました。")
    }
    onChanged()
  }

  const setStatus = async (status: "done" | "new") => {
    setBusy("status")
    const r = await fetchJson("/api/review-notices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewName: n.reviewName, status }),
    })
    setBusy(null)
    if (!r.ok) onError(r.error ?? "変更できませんでした")
    else onChanged()
  }

  const openMail = () => {
    const m = clientMessage(n, draft)
    setSubject(m.subject)
    setBody(m.body)
    setMailOpen(true)
  }

  const copyMessage = async () => {
    const m = clientMessage(n, draft)
    try {
      await navigator.clipboard.writeText(`${m.subject}\n\n${m.body}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      onError("コピーできませんでした。「メールで送る」を開いて、表示された文面を選択してお使いください。")
    }
  }

  const sendMail = async () => {
    if (!confirm(`${to} あてにメールを送ります。よろしいですか？`)) return
    setBusy("mail")
    onError(null)
    const r = await fetchJson("/api/review-notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "notify", reviewName: n.reviewName, to, subject, body }),
    })
    setBusy(null)
    if (!r.ok) {
      onError(r.error ?? "メールを送れませんでした")
      return
    }
    setMailOpen(false)
    onChanged()
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{n.storeTitle}</span>
        <span className="text-amber-500 tracking-widest" aria-label={`星${n.starRating}つ`}>
          {stars(n.starRating)}
        </span>
        <span className="text-xs text-muted-foreground">
          {fmtDay(n.reviewCreateTime)} ・ {n.reviewer ?? "匿名"}
        </span>
        {replied && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800">
            返信を投稿済み
          </span>
        )}
        {n.status === "notified" && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
            お客様に連絡済み（{fmtDateTime(n.notifiedAt)}）
          </span>
        )}
        {n.status === "done" && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">対応済み</span>
        )}
      </div>

      <div className="bg-gray-50 rounded p-3 text-sm whitespace-pre-wrap">
        {n.comment ?? "（コメントはありません）"}
      </div>

      {note && <p className="text-sm text-amber-800">{note}</p>}

      {!replied && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              返信案
              {n.draftSource && draft === n.draft
                ? `（${DRAFT_SOURCE_LABEL[n.draftSource] ?? n.draftSource}）`
                : ""}
            </span>
            {!draft && (
              <Button size="xs" variant="outline" onClick={makeDraft} disabled={busy === "draft"}>
                {busy === "draft" ? "作っています…" : "返信案を作る"}
              </Button>
            )}
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            rows={5}
            placeholder="返信案がまだありません。「返信案を作る」を押すか、ここに直接入力してください。"
            className="w-full border rounded px-3 py-2 text-sm bg-white"
          />
          <p className="text-xs text-muted-foreground">
            {draft.length} 文字 ・ 書き換えた内容は、入力欄の外を押すと保存されます
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!replied && (
          <Button size="sm" onClick={approve} disabled={!draft.trim() || busy === "post"}>
            {busy === "post" ? "投稿しています…" : "承認して Google に投稿"}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={copyMessage}>
          {copied ? "コピーしました" : "お客様への連絡文をコピー"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => (mailOpen ? setMailOpen(false) : openMail())}>
          {mailOpen ? "メールを閉じる" : "お客様にメールで送る"}
        </Button>
        <span className="ml-auto">
          {n.status === "done" ? (
            <Button size="sm" variant="ghost" onClick={() => setStatus("new")} disabled={busy === "status"}>
              未対応に戻す
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setStatus("done")} disabled={busy === "status"}>
              対応済みにする
            </Button>
          )}
        </span>
      </div>

      {mailOpen && (
        <div className="border rounded p-3 space-y-2 bg-gray-50">
          {!mailReady && (
            <p className="text-sm text-amber-800">
              この環境にはメール送信の設定がありません。下の文面をコピーしてお使いください。
            </p>
          )}
          <label className="block text-xs text-muted-foreground">
            宛先のメールアドレス
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="例：tantou@example.co.jp"
              className="mt-1 w-full h-9 px-2 text-sm border rounded bg-white text-foreground"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            件名
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full h-9 px-2 text-sm border rounded bg-white text-foreground"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            本文（送る前に直せます）
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="mt-1 w-full border rounded px-3 py-2 text-sm bg-white text-foreground"
            />
          </label>
          <Button size="sm" onClick={sendMail} disabled={!mailReady || !to.trim() || busy === "mail"}>
            {busy === "mail" ? "送っています…" : "この内容でメールを送る"}
          </Button>
        </div>
      )}
    </Card>
  )
}

export default function ReviewNoticesPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkNote, setCheckNote] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [emailSaved, setEmailSaved] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetchJson<Data>(`/api/review-notices${showAll ? "?status=all" : ""}`)
      if (!r.ok || !r.data) throw new Error(r.error ?? "読み込めませんでした")
      setData(r.data)
      setEmail(r.data.notifyEmail)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [showAll])

  useEffect(() => {
    load()
  }, [load])

  const check = async () => {
    setChecking(true)
    setError(null)
    setCheckNote(null)
    const r = await fetchJson<{
      result: { newCount: number; checkedStores: number; authFailed?: boolean; errors: number }
    }>("/api/review-notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check" }),
    })
    setChecking(false)
    if (!r.ok || !r.data) {
      setError(r.error ?? "確認できませんでした")
      return
    }
    const res = r.data.result
    if (res.authFailed) {
      setError(
        "Google の認証が通らず、確認できませんでした。投稿スケジューラの「自動実行を有効化」をやり直すか、ログインし直してください。"
      )
    } else {
      setCheckNote(
        `${res.checkedStores}店舗を確認しました。新しく見つかった低評価：${res.newCount}件` +
          (res.errors > 0 ? `（読み取れなかった店舗：${res.errors}）` : "")
      )
    }
    load()
  }

  const saveEmail = async () => {
    setError(null)
    const r = await fetchJson("/api/review-notices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyEmail: email }),
    })
    if (!r.ok) {
      setError(r.error ?? "保存できませんでした")
      return
    }
    setEmailSaved(true)
    setTimeout(() => setEmailSaved(false), 2000)
  }

  const open = data?.notices.filter((n) => n.status !== "done").length ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BellRing className="h-6 w-6" />
            低評価クチコミのお知らせ
          </h1>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            投稿を登録している店舗に、星1〜2のクチコミが新しく付くと、返信案つきでここに並びます。
            <br />
            返信の投稿も、お客様への連絡も、ボタンを押した時だけ行います。
          </p>
        </div>
        <Button onClick={check} disabled={checking} variant="outline" size="sm">
          {checking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {checking ? "確認しています…" : "いま確認する"}
        </Button>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}
      {checkNote && (
        <Card className="p-4 bg-green-50 border-green-200 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-700 mt-0.5 shrink-0" />
          <p className="text-sm text-green-900">{checkNote}</p>
        </Card>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">最後に確認した日時</p>
            <p className="text-lg font-bold">{fmtDateTime(data.lastCheck?.at)}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {data.lastCheck
                ? data.lastCheck.authFailed
                  ? "Google の認証が通らず、確認できませんでした"
                  : `${data.lastCheck.checkedStores}店舗を確認（${data.lastCheck.by}）`
                : "まだ確認していません。「いま確認する」を押してください。"}
              <br />
              このツールを開いている間は、3時間おきに自動で確認します。拾うのは直近
              {data.lookbackDays}日以内の、まだ返信が付いていない星1〜2です。
            </p>
          </Card>
          <Card className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground">新着があった時に、社内へメールで知らせる</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="受け取るメールアドレス（空なら送りません）"
                className="h-9 px-2 text-sm border rounded flex-1 min-w-56"
              />
              <Button size="sm" variant="outline" onClick={saveEmail}>
                {emailSaved ? "保存しました" : "保存"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {data.mailReady
                ? "自動で確認して新着が見つかった時だけ、1通にまとめて送ります。"
                : "この環境にはメール送信の設定がないため、登録しても送られません。"}
            </p>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-3">
        <p className="text-sm">
          未対応 <span className="font-bold">{open}</span> 件
        </p>
        <label className="text-sm text-muted-foreground flex items-center gap-1.5 ml-auto">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          対応済みも表示
        </label>
      </div>

      {loading && (
        <Card className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
          読み込んでいます…
        </Card>
      )}
      {!loading && data && data.notices.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          お知らせする低評価クチコミはありません。
        </Card>
      )}
      <div className="space-y-3">
        {data?.notices.map((n) => (
          <NoticeCard
            key={`${n.reviewName}:${n.draft.length}:${n.status}:${n.draftStatus ?? ""}`}
            n={n}
            mailReady={data.mailReady}
            onChanged={load}
            onError={setError}
          />
        ))}
      </div>
    </div>
  )
}
