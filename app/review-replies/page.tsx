"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { fetchJson } from "@/lib/fetch-json"
import { normalizeSearchText } from "@/lib/search-normalize"
import {
  DRAFT_SOURCE_LABEL,
  fmtDay,
  postReply,
  saveReplyDraft,
  skipReply,
  stars,
} from "@/lib/review-reply-client"
import { AlertCircle, Loader2, MessageSquareReply, RefreshCw, Search } from "lucide-react"

/**
 * クチコミ返信の下書きと承認。
 *
 * 店舗を1つ選ぶ → 未返信のクチコミに下書きを作る → 担当が読んで直す → 1件ずつ「承認して投稿」。
 * - 下書きは、承認するまで Google には出ない。
 * - 投稿の直前に Google の今の状態を確かめ、すでに返信が付いていれば上書きしない。
 * - 一度に扱うのは1店舗。複数の店舗にまとめて投稿する操作は置いていない。
 */

interface StoreRow {
  locationName: string
  title: string
  hasPosts: boolean
  unreplied: number
  high: number
  mid: number
  low: number
  latest: string | null
}
interface Review {
  reviewName: string
  reviewer: string | null
  starRating: number
  comment: string | null
  createTime: string | null
  draft: string
  draftSource: string | null
  skipped: boolean
}
type Band = "high" | "mid" | "low" | "all"

const BANDS: { key: Band; label: string }[] = [
  { key: "high", label: "星4〜5" },
  { key: "mid", label: "星3" },
  { key: "low", label: "星1〜2" },
  { key: "all", label: "すべて" },
]

function ReviewCard({
  r,
  locationName,
  storeTitle,
  onDone,
  onError,
}: {
  r: Review
  locationName: string
  storeTitle: string
  onDone: (reviewName: string, message?: string) => void
  onError: (m: string | null) => void
}) {
  const [draft, setDraft] = useState(r.draft)
  const [saved, setSaved] = useState(r.draft)
  const [busy, setBusy] = useState<string | null>(null)

  const save = async () => {
    if (draft === saved) return
    const err = await saveReplyDraft(r.reviewName, locationName, draft)
    if (err) onError(err)
    else setSaved(draft)
  }

  const approve = async () => {
    if (!draft.trim()) return
    if (
      !confirm(
        `この返信を「${storeTitle}」のクチコミに投稿します。\n\n投稿すると、Google の検索・マップで誰でも見られるようになります。\nよろしいですか？`
      )
    )
      return
    setBusy("post")
    onError(null)
    const res = await postReply(r.reviewName, locationName, draft)
    setBusy(null)
    if (!res.ok) {
      onError(res.error)
      return
    }
    if (res.status === "already") {
      onDone(
        r.reviewName,
        `${r.reviewer ?? "匿名"} さんのクチコミには、すでに返信が付いていました。上書きはしていません。`
      )
    } else if (res.status === "gone") {
      onDone(r.reviewName, `${r.reviewer ?? "匿名"} さんのクチコミは、Google から削除されていました。`)
    } else {
      onDone(r.reviewName)
    }
  }

  const skip = async () => {
    setBusy("skip")
    const err = await skipReply(r.reviewName, locationName, true)
    setBusy(null)
    if (err) onError(err)
    else onDone(r.reviewName)
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-amber-500 tracking-widest" aria-label={`星${r.starRating}つ`}>
          {stars(r.starRating)}
        </span>
        <span className="text-sm">{r.reviewer ?? "匿名"}</span>
        <span className="text-xs text-muted-foreground">{fmtDay(r.createTime)}</span>
      </div>
      <div className="bg-gray-50 rounded p-3 text-sm whitespace-pre-wrap">
        {r.comment ?? "（コメントはありません）"}
      </div>
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">
          返信の下書き
          {r.draftSource && draft === r.draft
            ? `（${DRAFT_SOURCE_LABEL[r.draftSource] ?? r.draftSource}）`
            : ""}
        </span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          rows={4}
          placeholder="まだ下書きがありません。上の「下書きをまとめて作る」を押すか、ここに直接入力してください。"
          className="w-full border rounded px-3 py-2 text-sm bg-white"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={approve} disabled={!draft.trim() || busy !== null}>
          {busy === "post" ? "投稿しています…" : "承認して Google に投稿"}
        </Button>
        <span className="text-xs text-muted-foreground">{draft.length} 文字</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={skip} disabled={busy !== null}>
          このクチコミは見送る
        </Button>
      </div>
    </Card>
  )
}

export default function ReviewRepliesPage() {
  const [stores, setStores] = useState<StoreRow[]>([])
  const [archiveLatest, setArchiveLatest] = useState<string | null>(null)
  const [aiReady, setAiReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<StoreRow | null>(null)
  const [band, setBand] = useState<Band>("high")
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [posted, setPosted] = useState(0)

  const loadStores = useCallback(async () => {
    try {
      const r = await fetchJson<{ stores: StoreRow[]; archiveLatest: string | null; aiReady: boolean }>(
        "/api/review-replies"
      )
      if (!r.ok || !r.data) throw new Error(r.error ?? "読み込めませんでした")
      setStores(r.data.stores)
      setArchiveLatest(r.data.archiveLatest)
      setAiReady(r.data.aiReady)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStores()
  }, [loadStores])

  const loadReviews = useCallback(async (store: StoreRow, b: Band) => {
    setReviews(null)
    const r = await fetchJson<{ reviews: Review[] }>(
      `/api/review-replies?locationName=${encodeURIComponent(store.locationName)}&band=${b}`
    )
    if (!r.ok || !r.data) {
      setError(r.error ?? "読み込めませんでした")
      setReviews([])
      return
    }
    setReviews(r.data.reviews.filter((x) => !x.skipped))
  }, [])

  const choose = (store: StoreRow) => {
    setSelected(store)
    setNotes([])
    setError(null)
    setPosted(0)
    // 星4〜5が無い店舗は、最初から「すべて」を出す
    const b: Band = store.high > 0 ? "high" : "all"
    setBand(b)
    loadReviews(store, b)
  }

  const changeBand = (b: Band) => {
    setBand(b)
    if (selected) loadReviews(selected, b)
  }

  const filtered = useMemo(() => {
    const key = normalizeSearchText(q)
    return key ? stores.filter((s) => normalizeSearchText(s.title).includes(key)) : stores
  }, [stores, q])

  const withoutDraft = reviews?.filter((r) => !r.draft.trim()) ?? []

  const makeDrafts = async () => {
    if (!selected || withoutDraft.length === 0) return
    setDrafting(true)
    setError(null)
    const r = await fetchJson("/api/review-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "draft",
        items: withoutDraft.slice(0, 20).map((x) => ({ reviewName: x.reviewName })),
      }),
    })
    setDrafting(false)
    if (!r.ok) {
      setError(r.error ?? "下書きを作れませんでした")
      return
    }
    loadReviews(selected, band)
  }

  /** この店舗のクチコミだけを取り込み直す（既存の「クチコミ取得」と同じ処理を1店舗に絞って呼ぶ） */
  const syncStore = async () => {
    if (!selected) return
    if (
      !confirm(
        `「${selected.title}」のクチコミを Google から取り込み直します。\n\nこの店舗の分だけ、取り込み済みのクチコミが最新の内容に更新されます。よろしいですか？`
      )
    )
      return
    setSyncing(true)
    setError(null)
    const r = await fetchJson("/api/reviews/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationNames: [selected.locationName] }),
    })
    setSyncing(false)
    if (!r.ok) {
      setError(r.error ?? "取り込めませんでした")
      return
    }
    await loadStores()
    loadReviews(selected, band)
  }

  const onDone = (reviewName: string, message?: string) => {
    setReviews((prev) => prev?.filter((x) => x.reviewName !== reviewName) ?? prev)
    if (message) setNotes((prev) => [...prev, message])
    else setPosted((n) => n + 1)
    loadStores()
  }

  const total = stores.reduce((a, s) => a + s.unreplied, 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquareReply className="h-6 w-6" />
          クチコミ返信の下書き
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          店舗を1つ選び、未返信のクチコミに下書きを作って、1件ずつ読んで承認します。
          <br />
          承認するまで Google には出ません。すでに返信が付いているクチコミには、上書きしません。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      <Card className="p-4 text-xs text-muted-foreground leading-relaxed space-y-1">
        <p>
          一覧のもとは、取り込み済みのクチコミです（いちばん新しい投稿日：
          <span className="text-foreground">{fmtDay(archiveLatest)}</span>
          ）。それより後のクチコミは、店舗を選んで「この店舗のクチコミを最新にする」を押すと出てきます。
        </p>
        <p>
          下書きは
          {aiReady
            ? "AIがクチコミの内容に合わせて作ります。"
            : "業種ごとの定型文から作ります（内容には踏み込まない文面です。一言足してから投稿してください）。"}
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 items-start">
        {/* 店舗を選ぶ */}
        <Card className="p-3 space-y-3">
          <p className="text-sm">
            未返信 <span className="font-bold">{total.toLocaleString()}</span> 件 ／ {stores.length}{" "}
            店舗
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="店舗名で絞り込み"
              className="h-9 pl-8 pr-3 text-sm border rounded w-full"
            />
          </div>
          {loading && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              <Loader2 className="h-4 w-4 animate-spin inline-block mr-1" />
              読み込んでいます…
            </p>
          )}
          <ul className="max-h-[70vh] overflow-y-auto divide-y border rounded">
            {filtered.map((s) => (
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
                    未返信 {s.unreplied} 件（星4〜5：{s.high} ／ 星3：{s.mid} ／ 星1〜2：{s.low}）
                    {s.hasPosts ? " ・ 投稿あり" : ""}
                  </span>
                </button>
              </li>
            ))}
            {!loading && filtered.length === 0 && (
              <li className="px-3 py-6 text-sm text-center text-muted-foreground">
                該当する店舗がありません
              </li>
            )}
          </ul>
        </Card>

        {/* クチコミと下書き */}
        <div className="space-y-3">
          {!selected && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              左の一覧から店舗を選んでください。
            </Card>
          )}
          {selected && (
            <>
              <Card className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium mr-auto">{selected.title}</p>
                  <Button size="sm" variant="outline" onClick={syncStore} disabled={syncing}>
                    {syncing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    この店舗のクチコミを最新にする
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {BANDS.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => changeBand(b.key)}
                      className={`px-3 py-1.5 text-xs rounded border ${
                        band === b.key
                          ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                          : "bg-white border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={makeDrafts}
                    disabled={drafting || withoutDraft.length === 0}
                  >
                    {drafting
                      ? "下書きを作っています…"
                      : `下書きをまとめて作る（${Math.min(20, withoutDraft.length)}件）`}
                  </Button>
                </div>
                {posted > 0 && (
                  <p className="text-sm text-green-800">この店舗で {posted} 件の返信を投稿しました。</p>
                )}
                {notes.map((n, i) => (
                  <p key={i} className="text-sm text-amber-800">
                    {n}
                  </p>
                ))}
              </Card>

              {reviews === null && (
                <Card className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  読み込んでいます…
                </Card>
              )}
              {reviews && reviews.length === 0 && (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                  この条件の未返信クチコミはありません。
                </Card>
              )}
              {reviews?.map((r) => (
                <ReviewCard
                  key={`${r.reviewName}:${r.draft.length}`}
                  r={r}
                  locationName={selected.locationName}
                  storeTitle={selected.title}
                  onDone={onDone}
                  onError={setError}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
