"use client"

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { fetchJson } from "@/lib/fetch-json"
import { normalizeSearchText } from "@/lib/search-normalize"
import { useGbp } from "@/lib/store"
import type { KeywordCount } from "@/lib/meo-keywords"
import type { MeoSnapshot } from "@/lib/meo-types"
import { AlertCircle, Loader2, Search, TextSearch } from "lucide-react"

/**
 * 検索キーワード。
 *
 * 「どんな言葉で検索されて、このプロフィールが表示されたか」を月ごとに出す。
 *   知っている人の検索 … 社名・住所・電話番号（もともと知っていて探した）
 *   探している人の検索 … 業種・地域などの一般の言葉（MEOで伸ばしたいのはこちら）
 * Google から読むだけ。順位そのものは Google の公式データに無いので、ここでは表示回数を見る。
 */

interface StoreRow {
  locationName: string
  title: string
  data: MeoSnapshot | null
}
interface MonthData {
  month: string
  knownTotal: number
  seekingTotal: number
  known: KeywordCount[]
  seeking: KeywordCount[]
  words: number
}
interface Detail {
  storeTitle: string
  brandWords: string[]
  cores: string[]
  failed: string[]
  months: MonthData[]
}

const monthLabel = (m: string) => `${Number(m.slice(5, 7))}月`
const countText = (k: KeywordCount) => (k.count == null ? `${k.under ?? 15}回未満` : `${k.count}回`)

export default function SearchWordsPage() {
  const router = useRouter()
  const { setLocationName } = useGbp()
  const [stores, setStores] = useState<StoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<StoreRow | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [brandInput, setBrandInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [showKnown, setShowKnown] = useState(false)

  useEffect(() => {
    fetchJson<{ stores: StoreRow[] }>("/api/meo/todo").then((r) => {
      if (r.ok && r.data) setStores(r.data.stores)
      else setError(r.error ?? "読み込めませんでした")
      setLoading(false)
    })
  }, [])

  const loadDetail = useCallback(async (store: StoreRow) => {
    setDetail(null)
    setDetailLoading(true)
    setError(null)
    const r = await fetchJson<Detail>(
      `/api/meo/keywords?locationName=${encodeURIComponent(store.locationName)}`
    )
    setDetailLoading(false)
    if (!r.ok || !r.data) {
      setError(r.error ?? "検索キーワードを読み込めませんでした")
      return
    }
    setDetail(r.data)
    setBrandInput(r.data.brandWords.join("、"))
  }, [])

  const choose = (s: StoreRow) => {
    setSelected(s)
    setShowKnown(false)
    loadDetail(s)
  }

  const saveBrand = async () => {
    if (!selected) return
    setSaving(true)
    const words = brandInput
      .split(/[、,，\n]/)
      .map((w) => w.trim())
      .filter(Boolean)
    const r = await fetchJson("/api/meo/keywords", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationName: selected.locationName, brandWords: words }),
    })
    setSaving(false)
    if (!r.ok) {
      setError(r.error ?? "保存できませんでした")
      return
    }
    loadDetail(selected)
  }

  /** 選んだ言葉を「社名として扱う言葉」に足す */
  const addBrand = (word: string) => {
    setBrandInput((prev) => (prev.trim() ? `${prev}、${word}` : word))
  }

  const filtered = useMemo(() => {
    const key = normalizeSearchText(q)
    const list = key ? stores.filter((s) => normalizeSearchText(s.title).includes(key)) : stores
    // 探している人の検索が多い順（数字がまだ無い店舗は後ろ）
    return [...list].sort(
      (a, b) => (b.data?.keywords?.seekingTotal ?? -1) - (a.data?.keywords?.seekingTotal ?? -1)
    )
  }, [stores, q])

  const latest = detail?.months.at(-1) ?? null
  const prev = detail?.months.at(-2) ?? null
  const prevCount = useMemo(() => {
    const m = new Map<string, number | null>()
    for (const k of prev?.seeking ?? []) m.set(k.word, k.count)
    return m
  }, [prev])
  const maxTotal = Math.max(1, ...(detail?.months.map((m) => m.knownTotal + m.seekingTotal) ?? [1]))

  const goto = (href: string) => {
    if (!selected) return
    setLocationName(selected.locationName)
    router.push(href)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TextSearch className="h-6 w-6" />
          検索キーワード
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          どんな言葉で検索されて、プロフィールが表示されたかを月ごとに出します。
          <br />
          「探している人の検索」（業種・地域などの一般の言葉）が、MEOで伸ばしたい数字です。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 items-start">
        {/* 店舗を選ぶ */}
        <Card className="p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="店舗名で絞り込み"
              className="h-9 pl-8 pr-3 text-sm border rounded w-full"
            />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            数字は、やることリストで最後に調べた月のものです（探している人の検索が多い順）。
          </p>
          {loading && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              <Loader2 className="h-4 w-4 animate-spin inline-block mr-1" />
              読み込んでいます…
            </p>
          )}
          <ul className="max-h-[70vh] overflow-y-auto divide-y border rounded">
            {filtered.map((s) => {
              const k = s.data?.keywords
              return (
                <li key={s.locationName}>
                  <button
                    type="button"
                    onClick={() => choose(s)}
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                      selected?.locationName === s.locationName ? "bg-blue-50" : ""
                    }`}
                  >
                    <span className="block text-sm">{s.title}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {k
                        ? `${monthLabel(k.month)}：探している人 ${k.seekingTotal.toLocaleString()}回 ／ 知っている人 ${k.knownTotal.toLocaleString()}回`
                        : "まだ調べていません"}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        {/* 選んだ店舗の検索キーワード */}
        <div className="space-y-3">
          {!selected && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              左の一覧から店舗を選んでください。
            </Card>
          )}
          {selected && detailLoading && (
            <Card className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
              Google から読み取っています…
            </Card>
          )}
          {selected && detail && latest && (
            <>
              <Card className="p-4 space-y-4">
                <p className="font-medium">{detail.storeTitle}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {monthLabel(latest.month)}・探している人の検索
                    </p>
                    <p className="text-3xl font-bold tabular-nums mt-1">
                      {latest.seekingTotal.toLocaleString()}
                      <span className="text-sm font-normal ml-1">回</span>
                    </p>
                    {prev && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {monthLabel(prev.month)}は {prev.seekingTotal.toLocaleString()}回
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {monthLabel(latest.month)}・知っている人の検索（社名・住所・電話）
                    </p>
                    <p className="text-3xl font-bold tabular-nums mt-1 text-gray-500">
                      {latest.knownTotal.toLocaleString()}
                      <span className="text-sm font-normal ml-1">回</span>
                    </p>
                    {prev && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {monthLabel(prev.month)}は {prev.knownTotal.toLocaleString()}回
                      </p>
                    )}
                  </div>
                </div>

                {/* 6か月の推移（濃い色＝探している人／薄い色＝知っている人） */}
                <div>
                  <div className="grid grid-cols-6 gap-3 items-end h-40 border-b border-gray-300">
                    {detail.months.map((m) => (
                      <div key={m.month} className="h-full flex flex-col justify-end">
                        <span className="text-xs tabular-nums text-center mb-1">
                          {m.seekingTotal.toLocaleString()}
                        </span>
                        <span
                          className="block bg-gray-200"
                          style={
                            {
                              height: `calc((100% - 20px) * ${m.knownTotal / maxTotal})`,
                            } as CSSProperties
                          }
                        />
                        <span
                          className="block bg-[#2c3e50]"
                          style={
                            {
                              height: `calc((100% - 20px) * ${m.seekingTotal / maxTotal})`,
                              minHeight: m.seekingTotal > 0 ? 2 : 0,
                            } as CSSProperties
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-6 gap-3 mt-1">
                    {detail.months.map((m) => (
                      <span key={m.month} className="text-xs text-muted-foreground text-center">
                        {monthLabel(m.month)}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    濃い色＝探している人の検索（上の数字）／薄い色＝知っている人の検索。Google
                    が「15回未満」としか出さない言葉は、合計に入れていません。
                  </p>
                </div>
                {detail.failed.length > 0 && (
                  <p className="text-xs text-amber-800">
                    読み取れなかった月があります（{detail.failed.map(monthLabel).join("・")}）。
                  </p>
                )}
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium mr-auto">
                    {monthLabel(latest.month)}に、探している人が使った言葉
                  </p>
                  <Button size="sm" variant="outline" onClick={() => goto("/google-data/gbp/basic-info")}>
                    説明文に入れる（基本情報へ）
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => goto("/google-data/gbp/posts")}>
                    投稿に入れる（投稿へ）
                  </Button>
                </div>
                {latest.seeking.length === 0 ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    この月は、一般の言葉での検索がありませんでした（社名での検索だけです）。
                    <br />
                    追加カテゴリ・サービスの登録や、業種と地域の言葉を入れた説明文・投稿で、ここを増やしていけます。
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-600">
                      <tr className="border-b">
                        <th className="text-left py-2 font-normal">検索された言葉</th>
                        <th className="text-right py-2 font-normal whitespace-nowrap">表示された回数</th>
                        <th className="text-right py-2 font-normal whitespace-nowrap">前の月</th>
                        <th className="py-2 w-40" />
                      </tr>
                    </thead>
                    <tbody>
                      {latest.seeking.map((k) => (
                        <tr key={k.word} className="border-b last:border-b-0">
                          <td className="py-2">{k.word}</td>
                          <td className="py-2 text-right tabular-nums">{countText(k)}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {prevCount.has(k.word)
                              ? prevCount.get(k.word) == null
                                ? "15回未満"
                                : `${prevCount.get(k.word)}回`
                              : "—"}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => addBrand(k.word)}
                              className="text-xs text-[#4a90e2] hover:underline"
                            >
                              社名の言葉として扱う
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <button
                  type="button"
                  onClick={() => setShowKnown(!showKnown)}
                  className="text-xs text-[#4a90e2] hover:underline"
                >
                  {showKnown
                    ? "知っている人の検索を閉じる"
                    : `知っている人の検索も見る（${latest.known.length}語）`}
                </button>
                {showKnown && (
                  <ul className="text-sm divide-y border rounded">
                    {latest.known.map((k) => (
                      <li key={k.word} className="flex justify-between gap-3 px-3 py-1.5">
                        <span>{k.word}</span>
                        <span className="tabular-nums text-muted-foreground whitespace-nowrap">
                          {countText(k)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-4 space-y-2">
                <p className="text-sm font-medium">社名として扱う言葉</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  店舗名から自動で判定しています（いまの判定：{detail.cores.join("、") || "—"}
                  ）。略称・旧社名・ローマ字など、社名なのに「探している人」に入ってしまう言葉があれば、ここに足してください。
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={brandInput}
                    onChange={(e) => setBrandInput(e.target.value)}
                    placeholder="例：アイリンク、ilink（「、」で区切る）"
                    className="h-9 px-2 text-sm border rounded flex-1 min-w-64"
                  />
                  <Button size="sm" variant="outline" onClick={saveBrand} disabled={saving}>
                    {saving ? "保存しています…" : "保存して分け直す"}
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
