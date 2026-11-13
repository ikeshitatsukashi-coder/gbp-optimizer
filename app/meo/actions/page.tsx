"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { fetchJson } from "@/lib/fetch-json"
import { normalizeSearchText } from "@/lib/search-normalize"
import { MEO_CHECKS, checkLabel } from "@/lib/meo-types"
import { AlertCircle, Loader2, NotebookPen } from "lucide-react"

/**
 * 対策の記録と効果。
 *
 * 「いつ・どの店舗に・何をしたか」を記録しておくと、その前後（最大4週間ずつ）の
 * 表示回数や問い合わせの動きを並べて見られる。お客様への報告文もここから作れる。
 * 記録を付けるだけで、Google のプロフィールには何も書き込まない。
 */

interface Action {
  id: number
  locationName: string
  title: string
  actionDate: string
  kind: string
  note: string | null
  createdBy: string | null
}
interface Totals {
  impressions: number
  websiteClicks: number
  directions: number
  calls: number
}
interface Compare {
  days: number
  complete?: boolean
  readyOn?: string
  beforeRange?: { start: string; end: string }
  afterRange?: { start: string; end: string }
  before: Totals | null
  after: Totals | null
}
interface StoreOption {
  locationName: string
  title: string
}

const METRICS: { key: keyof Totals; label: string }[] = [
  { key: "impressions", label: "表示された回数" },
  { key: "websiteClicks", label: "Webサイトへ進んだ" },
  { key: "directions", label: "ルートを調べた" },
  { key: "calls", label: "電話をかけた" },
]

const md = (day: string) => `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`

function diffText(before: number, after: number) {
  const d = after - before
  if (d === 0) return "変わらず"
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toLocaleString()}`
}

/** お客様に伝える時の文面。数字をそのまま並べる（良し悪しの評価は書かない） */
function reportText(a: Action, c: Compare): string {
  if (!c.before || !c.after || !c.beforeRange || !c.afterRange) return ""
  const lines = METRICS.map(
    (m) =>
      `・${m.label}：${c.before![m.key].toLocaleString()}回 → ${c.after![m.key].toLocaleString()}回`
  )
  return `${a.title} 様

${md(a.actionDate)}に、Googleビジネスプロフィールで「${checkLabel(a.kind)}」を行いました。
その前後${c.days}日間の数字をお知らせします。

対応前（${md(c.beforeRange.start)}〜${md(c.beforeRange.end)}） → 対応後（${md(c.afterRange.start)}〜${md(c.afterRange.end)}）
${lines.join("\n")}
${c.complete ? "" : `\n※対応後の数字は途中経過です（${c.days}日ぶん）。4週間そろった時点で、あらためてお知らせします。\n`}`
}

export default function MeoActionsPage() {
  const [actions, setActions] = useState<Action[]>([])
  const [today, setToday] = useState("")
  const [stores, setStores] = useState<StoreOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [compare, setCompare] = useState<Record<number, Compare | "loading">>({})
  const [copied, setCopied] = useState<number | null>(null)

  // 追加フォーム
  const [storeQ, setStoreQ] = useState("")
  const [loc, setLoc] = useState("")
  const [date, setDate] = useState("")
  const [kind, setKind] = useState(MEO_CHECKS[0].id)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetchJson<{ actions: Action[]; today: string }>("/api/meo/actions")
      if (!r.ok || !r.data) throw new Error(r.error ?? "読み込めませんでした")
      setActions(r.data.actions)
      setToday(r.data.today)
      setDate((d) => d || r.data!.today)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    fetchJson<{ stores: StoreOption[] }>("/api/meo/todo").then((r) => {
      if (r.ok && r.data) setStores(r.data.stores)
    })
  }, [load])

  const storeOptions = useMemo(() => {
    const key = normalizeSearchText(storeQ)
    return key ? stores.filter((s) => normalizeSearchText(s.title).includes(key)) : stores
  }, [stores, storeQ])

  const add = async () => {
    if (!loc) {
      setError("店舗を選んでください")
      return
    }
    setSaving(true)
    setError(null)
    const r = await fetchJson("/api/meo/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationName: loc, actionDate: date, kind, note }),
    })
    setSaving(false)
    if (!r.ok) {
      setError(r.error ?? "記録できませんでした")
      return
    }
    setNote("")
    load()
  }

  const toggle = async (a: Action) => {
    if (open === a.id) {
      setOpen(null)
      return
    }
    setOpen(a.id)
    if (compare[a.id]) return
    setCompare((prev) => ({ ...prev, [a.id]: "loading" }))
    const r = await fetchJson<Compare>(`/api/meo/actions?id=${a.id}`)
    if (!r.ok || !r.data) {
      setError(r.error ?? "数字を読み取れませんでした")
      setCompare((prev) => {
        const next = { ...prev }
        delete next[a.id]
        return next
      })
      return
    }
    setCompare((prev) => ({ ...prev, [a.id]: r.data! }))
  }

  const remove = async (a: Action) => {
    if (!confirm(`「${a.title}」の ${md(a.actionDate)} の記録を削除します。よろしいですか？`)) return
    const r = await fetchJson(`/api/meo/actions?id=${a.id}`, { method: "DELETE" })
    if (!r.ok) setError(r.error ?? "削除できませんでした")
    else load()
  }

  const copy = async (a: Action, c: Compare) => {
    try {
      await navigator.clipboard.writeText(reportText(a, c))
      setCopied(a.id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setError("コピーできませんでした")
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <NotebookPen className="h-6 w-6" />
          対策の記録と効果
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          いつ・どの店舗に・何をしたかを記録しておくと、その前後の数字を並べて見られます。
          <br />
          やることリストの「対応した」からも、同じ記録が付きます。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <p className="text-sm font-medium">記録を追加する</p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_220px] gap-3">
          <div className="space-y-1">
            <input
              value={storeQ}
              onChange={(e) => setStoreQ(e.target.value)}
              placeholder="店舗名で絞り込み"
              className="h-9 px-2 text-sm border rounded w-full"
            />
            <select
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              className="h-9 px-2 text-sm border rounded w-full bg-white"
            >
              <option value="">店舗を選ぶ</option>
              {storeOptions.map((s) => (
                <option key={s.locationName} value={s.locationName}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
          <label className="text-xs text-muted-foreground">
            対応した日
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 h-9 px-2 text-sm border rounded w-full text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            対応した内容
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="mt-1 h-9 px-2 text-sm border rounded w-full bg-white text-foreground"
            >
              {MEO_CHECKS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
              <option value="other">その他</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="メモ（例：追加カテゴリに「倉庫」「引越し運送業者」を設定）"
            className="h-9 px-2 text-sm border rounded flex-1 min-w-64"
          />
          <Button size="sm" onClick={add} disabled={saving}>
            {saving ? "記録しています…" : "記録する"}
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">対応した日</th>
                <th className="text-left px-3 py-2 font-normal min-w-56">店舗名</th>
                <th className="text-left px-3 py-2 font-normal">内容</th>
                <th className="px-3 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                    読み込んでいます…
                  </td>
                </tr>
              )}
              {!loading && actions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    まだ記録がありません。プロフィールを直した時に、上の欄か、やることリストの「対応した」から記録してください。
                  </td>
                </tr>
              )}
              {actions.map((a) => {
                const c = compare[a.id]
                return (
                  <Fragment key={a.id}>
                    <tr className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{a.actionDate}</td>
                      <td className="px-3 py-2">{a.title}</td>
                      <td className="px-3 py-2">
                        {checkLabel(a.kind)}
                        {a.note && (
                          <span className="block text-xs text-muted-foreground">{a.note}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button size="sm" variant="outline" onClick={() => toggle(a)}>
                          {open === a.id ? "閉じる" : "前後の数字を見る"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(a)}>
                          削除
                        </Button>
                      </td>
                    </tr>
                    {open === a.id && (
                      <tr className="border-t bg-gray-50">
                        <td colSpan={4} className="px-3 py-4">
                          {c === "loading" || !c ? (
                            <p className="text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin inline-block mr-1" />
                              Google から数字を読み取っています…
                            </p>
                          ) : c.days === 0 || !c.before || !c.after ? (
                            <p className="text-sm text-muted-foreground">
                              対応後の数字は、まだ出ていません。Google
                              の集計が数日おくれて届くため、{c.readyOn ? md(c.readyOn) : "数日後"}
                              ごろから見られます。
                            </p>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-xs text-muted-foreground">
                                対応前 {md(c.beforeRange!.start)}〜{md(c.beforeRange!.end)} ／ 対応後{" "}
                                {md(c.afterRange!.start)}〜{md(c.afterRange!.end)}（{c.days}日間ずつ）
                                {!c.complete && " ・ 途中経過です（4週間そろうまで数字は動きます）"}
                              </p>
                              <table className="w-full max-w-2xl text-sm bg-white border">
                                <thead className="text-xs text-gray-600">
                                  <tr>
                                    <th className="text-left px-3 py-2 font-normal" />
                                    <th className="text-right px-3 py-2 font-normal">対応前</th>
                                    <th className="text-right px-3 py-2 font-normal">対応後</th>
                                    <th className="text-right px-3 py-2 font-normal">差</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {METRICS.map((m) => (
                                    <tr key={m.key} className="border-t">
                                      <td className="px-3 py-2">{m.label}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">
                                        {c.before![m.key].toLocaleString()}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                                        {c.after![m.key].toLocaleString()}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                        {diffText(c.before![m.key], c.after![m.key])}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                                数字は季節や曜日、ほかの対策の影響も受けます。「この対策だけの効果」とは言い切れないので、目安として見てください。
                              </p>
                              <Button size="sm" variant="outline" onClick={() => copy(a, c)}>
                                {copied === a.id ? "コピーしました" : "お客様への報告文をコピー"}
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
