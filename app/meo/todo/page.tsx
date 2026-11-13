"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { fetchJson } from "@/lib/fetch-json"
import { normalizeSearchText } from "@/lib/search-normalize"
import { useGbp } from "@/lib/store"
import { FIX_HREF, FIX_LABEL, MEO_CHECKS, type MeoCheck, type MeoSnapshot } from "@/lib/meo-types"
import { AlertCircle, ListChecks, Loader2, RefreshCw, Search } from "lucide-react"

/**
 * MEO やることリスト。
 *
 * 投稿を登録している全店舗のプロフィールを Google から読み、
 * 「設定すると効く所が、どの店舗で空いているか」を、やることの種類ごとに並べる。
 * - 読み取りだけ。プロフィールは書き換えない（直すのは、行のボタンから開いた画面で1店舗ずつ）。
 * - 1日以上たっていたら、開いた時に自動で読み直す。
 */

interface StoreRow {
  locationName: string
  title: string
  checkedAt: string | null
  data: MeoSnapshot | null
  dismissed: string[]
}

/** これより古い控えは、開いた時に自動で読み直す */
const STALE_MS = 24 * 3600e3

function fmtDateTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function MeoTodoPage() {
  const router = useRouter()
  const { setLocationName } = useGbp()
  const [stores, setStores] = useState<StoreRow[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [view, setView] = useState<"task" | "store">("task")
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState("")
  /** この画面で「対応した」を押した項目（次に調べるまで、一覧から外して見せる） */
  const [recorded, setRecorded] = useState<Set<string>>(new Set())
  const autoRan = useRef(false)

  const load = useCallback(async () => {
    try {
      const r = await fetchJson<{ stores: StoreRow[]; now: string }>("/api/meo/todo")
      if (!r.ok || !r.data) throw new Error(r.error ?? "読み込めませんでした")
      setStores(r.data.stores)
      setNow(new Date(r.data.now).getTime())
      return r.data.stores
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  /** Google から読み直す。時間で区切られているので、残りが無くなるまで続けて呼ぶ */
  const refresh = useCallback(async () => {
    setError(null)
    const since = new Date().toISOString()
    setProgress({ done: 0, total: 0 })
    let done = 0
    for (let i = 0; i < 20; i++) {
      const r = await fetchJson<{
        processed: number
        remaining: number
        total: number
        authFailed?: boolean
      }>("/api/meo/todo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh", since }),
      })
      if (!r.ok || !r.data) {
        setError(r.error ?? "Google から読み取れませんでした")
        break
      }
      if (r.data.authFailed) {
        setError(
          "Google の認証が通らず、読み取れませんでした。投稿スケジューラの「自動実行を有効化」をやり直すか、ログインし直してください。"
        )
        break
      }
      done += r.data.processed
      setProgress({ done, total: done + r.data.remaining })
      if (r.data.remaining === 0 || r.data.processed === 0) break
    }
    setProgress(null)
    setRecorded(new Set())
    await load()
  }, [load])

  useEffect(() => {
    load().then((list) => {
      if (!list || autoRan.current) return
      autoRan.current = true
      const stale = list.some(
        (s) => !s.checkedAt || Date.now() - new Date(s.checkedAt).getTime() > STALE_MS
      )
      if (stale && list.length > 0) refresh()
    })
  }, [load, refresh])

  const checked = stores.filter((s) => s.data)
  const oldest = checked
    .map((s) => s.checkedAt!)
    .sort()
    .at(0)

  /** やることの種類ごとの、対象の店舗 */
  const byCheck = useMemo(() => {
    return MEO_CHECKS.map((c) => ({
      check: c,
      stores: checked.filter(
        (s) =>
          c.todo(s.data!, now) &&
          !s.dismissed.includes(c.id) &&
          !recorded.has(`${s.locationName}:${c.id}`)
      ),
      dismissed: checked.filter((s) => c.todo(s.data!, now) && s.dismissed.includes(c.id)),
    }))
  }, [checked, now, recorded])

  const totalTodo = byCheck.reduce((a, b) => a + b.stores.length, 0)

  const goFix = (s: StoreRow, c: MeoCheck) => {
    const href = FIX_HREF[c.fix]
    if (href) {
      setLocationName(s.locationName)
      router.push(href)
    } else if (s.data?.mapsUri) {
      window.open(s.data.mapsUri, "_blank", "noopener")
    }
  }

  const record = async (s: StoreRow, c: MeoCheck) => {
    if (
      !confirm(
        `「${s.title}」の「${c.label}」を、きょう対応したものとして記録します。\n\n記録しておくと、「対策の記録と効果」で前後の数字を比べられます。`
      )
    )
      return
    const r = await fetchJson("/api/meo/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationName: s.locationName, kind: c.id }),
    })
    if (!r.ok) {
      setError(r.error ?? "記録できませんでした")
      return
    }
    setRecorded((prev) => new Set(prev).add(`${s.locationName}:${c.id}`))
  }

  const dismiss = async (s: StoreRow, c: MeoCheck, dismissed: boolean) => {
    if (
      dismissed &&
      !confirm(
        `「${s.title}」では「${c.label}」を対象外にします（例：事務所なのでサービスの登録が要らない）。\n\nあとで戻せます。`
      )
    )
      return
    const r = await fetchJson("/api/meo/todo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationName: s.locationName, checkId: c.id, dismissed }),
    })
    if (!r.ok) {
      setError(r.error ?? "変更できませんでした")
      return
    }
    setStores((prev) =>
      prev.map((x) =>
        x.locationName === s.locationName
          ? {
              ...x,
              dismissed: dismissed
                ? [...x.dismissed, c.id]
                : x.dismissed.filter((d) => d !== c.id),
            }
          : x
      )
    )
  }

  const filteredStores = useMemo(() => {
    const key = normalizeSearchText(q)
    return key ? stores.filter((s) => normalizeSearchText(s.title).includes(key)) : stores
  }, [stores, q])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListChecks className="h-6 w-6" />
            MEO やることリスト
          </h1>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            投稿を登録している全店舗のプロフィールを調べて、設定すると効く所が空いている店舗を、やることの種類ごとに並べます。
            <br />
            調べるのは読み取りだけです。直すのは、行のボタンから開いた画面で1店舗ずつ行います。
          </p>
        </div>
        <Button onClick={refresh} disabled={!!progress} variant="outline" size="sm">
          {progress ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {progress
            ? progress.total > 0
              ? `調べています… ${progress.done} / ${progress.total} 店舗`
              : "調べています…"
            : "いま調べる"}
        </Button>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      <Card className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-sm">
          やること <span className="text-xl font-bold">{totalTodo}</span> 件 ／ {checked.length} 店舗
        </p>
        <p className="text-xs text-muted-foreground">
          調べた日時：{fmtDateTime(oldest ?? null)}
          {stores.length > checked.length ? `（まだ調べていない店舗：${stores.length - checked.length}）` : ""}
        </p>
        <div className="ml-auto flex items-center gap-2">
          {(
            [
              ["task", "やること別"],
              ["store", "店舗別"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`px-3 py-1.5 text-xs rounded border ${
                view === key
                  ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                  : "bg-white border-gray-300 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {loading && (
        <Card className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
          読み込んでいます…
        </Card>
      )}

      {/* ---------------------------- やること別 ---------------------------- */}
      {!loading && view === "task" && (
        <div className="space-y-3">
          {checked.length === 0 && !progress && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              まだ調べていません。「いま調べる」を押してください。
            </Card>
          )}
          {byCheck
            .filter((b) => b.stores.length > 0 || b.dismissed.length > 0)
            .map(({ check: c, stores: list, dismissed }) => (
              <Card key={c.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(open === c.id ? null : c.id)}
                  className="w-full text-left p-4 flex items-start gap-4 hover:bg-gray-50"
                >
                  <span className="w-16 shrink-0 text-right">
                    <span className="text-2xl font-bold tabular-nums">{list.length}</span>
                    <span className="text-xs text-muted-foreground ml-1">店舗</span>
                  </span>
                  <span className="flex-1">
                    <span className="block font-medium">{c.label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {c.why}
                    </span>
                  </span>
                  <span className="text-xs text-[#4a90e2] whitespace-nowrap mt-1">
                    {open === c.id ? "閉じる" : "店舗を見る"}
                  </span>
                </button>
                {open === c.id && (
                  <div className="border-t">
                    <table className="w-full text-sm">
                      <tbody>
                        {list.map((s) => (
                          <tr key={s.locationName} className="border-b last:border-b-0">
                            <td className="px-4 py-2">{s.title}</td>
                            <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                              {c.state(s.data!, now)}
                            </td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">
                              <span className="inline-flex items-center gap-1">
                                <Button size="sm" variant="outline" onClick={() => goFix(s, c)}>
                                  {FIX_LABEL[c.fix]}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => record(s, c)}>
                                  対応した
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => dismiss(s, c, true)}>
                                  対象外にする
                                </Button>
                              </span>
                            </td>
                          </tr>
                        ))}
                        {list.length === 0 && (
                          <tr>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              対応が必要な店舗はありません。
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {dismissed.length > 0 && (
                      <p className="px-4 py-2 border-t text-xs text-muted-foreground leading-relaxed">
                        対象外にした店舗：
                        {dismissed.map((s) => (
                          <button
                            key={s.locationName}
                            type="button"
                            onClick={() => dismiss(s, c, false)}
                            className="ml-2 text-[#4a90e2] hover:underline"
                          >
                            {s.title}（戻す）
                          </button>
                        ))}
                      </p>
                    )}
                    {c.fix === "google" && (
                      <p className="px-4 py-2 border-t text-xs text-muted-foreground leading-relaxed">
                        この項目は、このツールからは直せません。Googleマップで店舗を開き、「プロフィールを編集」から設定してください。
                      </p>
                    )}
                  </div>
                )}
              </Card>
            ))}
          {checked.length > 0 && totalTodo === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              いま対応が必要な項目はありません。
            </Card>
          )}
        </div>
      )}

      {/* ----------------------------- 店舗別 ----------------------------- */}
      {!loading && view === "store" && (
        <Card className="overflow-hidden">
          <div className="p-3 border-b flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="店舗名で絞り込み"
                className="h-9 pl-8 pr-3 text-sm border rounded w-56"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              「要」＝やることあり ／「—」＝設定済み・対象外
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2 font-normal min-w-56 sticky left-0 bg-gray-50">
                    店舗名
                  </th>
                  <th className="text-right px-2 py-2 font-normal whitespace-nowrap">やること</th>
                  {MEO_CHECKS.map((c) => (
                    <th
                      key={c.id}
                      className="px-2 py-2 font-normal text-center whitespace-nowrap"
                      title={`${c.label}：${c.why}`}
                    >
                      {c.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStores.map((s) => {
                  const todos = s.data
                    ? MEO_CHECKS.filter((c) => c.todo(s.data!, now) && !s.dismissed.includes(c.id))
                    : []
                  return (
                    <tr key={s.locationName} className="border-t">
                      <td className="px-3 py-2 sticky left-0 bg-white">{s.title}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">
                        {s.data ? todos.length : "—"}
                      </td>
                      {MEO_CHECKS.map((c) => {
                        const need = todos.some((t) => t.id === c.id)
                        return (
                          <td key={c.id} className="px-2 py-2 text-center">
                            {!s.data ? (
                              <span className="text-gray-300">—</span>
                            ) : need ? (
                              <button
                                type="button"
                                onClick={() => goFix(s, c)}
                                title={`${c.state(s.data, now)}（押すと直す画面を開きます）`}
                                className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 hover:bg-amber-200"
                              >
                                要
                              </button>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
