"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { fetchJson } from "@/lib/fetch-json"
import { normalizeSearchText } from "@/lib/search-normalize"
import { AlertCircle, Loader2, MousePointerClick, Search } from "lucide-react"

/**
 * 投稿ボタンのクリック数。
 *
 * 店舗ごとに「計測する」をONにすると、それ以降に公開される予約投稿のボタンが
 * 計測用のURLになり、何回押されたかを投稿ごとに数えられる。
 * 初期状態はすべてOFF（＝これまでと同じ動き）。
 */

interface Row {
  locationName: string
  title: string
  trackingOn: boolean
  pendingWithButton: number
  trackedPosts: number
  clicksTotal: number
  clicks30d: number
}
interface PostRow {
  linkId: number
  postId: number | null
  summary: string | null
  status: string | null
  executedAt: string | null
  scheduledFor: string | null
  actionType: string | null
  targetUrl: string
  tracking: string | null
  clicks: number
  clicks7d: number
}

const ACTION_LABEL: Record<string, string> = {
  LEARN_MORE: "詳細",
  BOOK: "予約",
  ORDER: "注文",
  SHOP: "購入",
  SIGN_UP: "登録",
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })
}

export default function PostClicksPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [ready, setReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [posts, setPosts] = useState<PostRow[] | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const r = await fetchJson<{ stores: Row[]; ready: boolean }>("/api/post-clicks")
      if (!r.ok || !r.data) throw new Error(r.error ?? "読み込めませんでした")
      setRows(r.data.stores)
      setReady(r.data.ready)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const key = normalizeSearchText(q)
    return key ? rows.filter((r) => normalizeSearchText(r.title).includes(key)) : rows
  }, [rows, q])

  const toggle = async (row: Row) => {
    const next = !row.trackingOn
    const msg = next
      ? `「${row.title}」のクリック計測をONにします。\n\nこれから公開される予約投稿のボタンが、計測用のURL（このツールを経由して、元のリンク先へ進むURL）になります。\n公開済みの投稿と、予約の中身は変わりません。\n\nよろしいですか？`
      : `「${row.title}」のクリック計測をOFFにします。\n\nこれから公開される予約投稿は、元のリンク先のまま投稿されます。\nすでに計測用のURLで公開した投稿は、そのまま数え続けます。`
    if (!confirm(msg)) return
    setBusy(row.locationName)
    setError(null)
    try {
      const r = await fetchJson("/api/post-clicks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationName: row.locationName, enabled: next }),
      })
      if (!r.ok) throw new Error(r.error ?? "切り替えられませんでした")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const toggleOpen = async (row: Row) => {
    if (open === row.locationName) {
      setOpen(null)
      return
    }
    setOpen(row.locationName)
    setPosts(null)
    const r = await fetchJson<{ posts: PostRow[] }>(
      `/api/post-clicks?locationName=${encodeURIComponent(row.locationName)}`
    )
    setPosts(r.ok && r.data ? r.data.posts : [])
  }

  const onCount = rows.filter((r) => r.trackingOn).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MousePointerClick className="h-6 w-6" />
          投稿ボタンのクリック数
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          投稿に付けたボタン（詳細・予約など）が何回押されたかを、投稿ごとに数えます。
          <br />
          店舗ごとに「計測する」をONにした場合だけ働きます。初めはすべてOFFです。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      <Card className="p-4 space-y-2 text-sm leading-relaxed">
        <p className="font-medium">ONにすると変わること</p>
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
          <li>
            その店舗で<span className="text-foreground">これから公開される予約投稿</span>
            のボタンのリンク先が、計測用のURLになります。押した人は一瞬このツールを経由して、元のリンク先へ進みます。
          </li>
          <li>公開済みの投稿、予約の中身（本文・写真・リンク先）は書き換えません。</li>
          <li>
            計測用のURLが Google に通らなかった場合は、元のリンク先で出し直します（下の表に「元のURLで公開」と出ます）。投稿が止まることはありません。
          </li>
          <li>
            Google が投稿ごとの数字を出さなくなったための仕組みです。まず1店舗で試し、公開された投稿のボタンを実際に押して確かめてから広げてください。
          </li>
        </ul>
        {!ready && (
          <p className="text-amber-800">
            この環境では計測用のURLを作れません（本番でのみ働きます）。
          </p>
        )}
      </Card>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <p className="text-sm">
          計測中 <span className="font-bold">{onCount}</span> 店舗 ／ 全{rows.length} 店舗
        </p>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="店舗名で絞り込み"
            className="h-9 pl-8 pr-3 text-sm border rounded w-56"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 font-normal min-w-64">店舗名</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">計測</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">
                  ボタン付きの予約
                </th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">計測した投稿</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">
                  クリック（直近30日）
                </th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">クリック（累計）</th>
                <th className="px-3 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                    読み込んでいます…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    該当する店舗がありません
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((r) => (
                  <Fragment key={r.locationName}>
                    <tr className="border-t">
                      <td className="px-3 py-2">{r.title}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              r.trackingOn
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {r.trackingOn ? "計測中" : "OFF"}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === r.locationName}
                            onClick={() => toggle(r)}
                          >
                            {r.trackingOn ? "OFFにする" : "計測する"}
                          </Button>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.pendingWithButton} 件</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.trackedPosts} 件</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {r.clicks30d} 回
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.clicksTotal} 回</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {(r.trackingOn || r.trackedPosts > 0) && (
                          <Button size="sm" variant="outline" onClick={() => toggleOpen(r)}>
                            {open === r.locationName ? "閉じる" : "投稿ごとの数字"}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {open === r.locationName && (
                      <tr className="border-t bg-gray-50">
                        <td colSpan={7} className="px-3 py-4">
                          {posts === null && (
                            <p className="text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin inline-block mr-1" />
                              読み込んでいます…
                            </p>
                          )}
                          {posts && posts.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                              まだ計測した投稿がありません。次にボタン付きの予約投稿が公開されると、ここに出ます。
                            </p>
                          )}
                          {posts && posts.length > 0 && (
                            <table className="w-full text-sm bg-white border">
                              <thead className="text-xs text-gray-600">
                                <tr>
                                  <th className="text-left px-3 py-2 font-normal whitespace-nowrap">
                                    公開日
                                  </th>
                                  <th className="text-left px-3 py-2 font-normal">投稿の書き出し</th>
                                  <th className="text-left px-3 py-2 font-normal whitespace-nowrap">
                                    ボタン
                                  </th>
                                  <th className="text-right px-3 py-2 font-normal whitespace-nowrap">
                                    直近7日
                                  </th>
                                  <th className="text-right px-3 py-2 font-normal whitespace-nowrap">
                                    累計
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {posts.map((p) => (
                                  <tr key={p.linkId} className="border-t">
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      {fmtDate(p.executedAt ?? p.scheduledFor)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {p.summary ?? "（予約が見つかりません）"}
                                      {p.tracking === "fallback" && (
                                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 whitespace-nowrap">
                                          元のURLで公開（数えられません）
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      {ACTION_LABEL[p.actionType ?? ""] ?? p.actionType ?? "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                      {p.clicks7d} 回
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                                      {p.clicks} 回
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
