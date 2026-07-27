"use client"

import { Fragment, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import {
  Star,
  MessageSquare,
  Search,
  Loader2,
  FileText,
  ChevronDown,
  ChevronsUpDown,
  Download,
} from "lucide-react"
import { useGbpData } from "@/lib/use-gbp-data"
import { useGbp } from "@/lib/store"
import { reviewsList as mockReviews, storeName as mockStoreName } from "@/lib/mock-data"
import { getTemplatesForRating, applyTemplate } from "@/lib/reply-templates"
import { analyzeSentiment } from "@/lib/sentiment"

interface Review {
  id: string
  author: string
  photoUrl: string | null
  rating: number
  /** 初回投稿日 */
  date: string
  /** 最新更新日 */
  updatedDate: string | null
  text: string
  reply: string | null
  /** 最新返信日 */
  replyDate: string | null
}

function fmt(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

/** 日付＋時刻（参考ツールと同じ粒度で表示する） */
function fmtDateTime(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 名前から安定した色を作り、頭文字アバターに使う */
const AVATAR_COLORS = [
  "#e0568f", "#e8833a", "#4a90e2", "#41a381", "#8b7ce8",
  "#e35d6a", "#2f8f85", "#d9a545", "#6b7280", "#7c4dff",
]
function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function avatarLabel(name: string): string {
  const n = name.trim()
  if (!n || n === "匿名") return "?"
  // 日本語なら先頭2文字、英字なら先頭1文字
  return /^[\x20-\x7E]+$/.test(n) ? n[0].toUpperCase() : n.slice(0, 2)
}

/**
 * API 応答からレビュー配列に変換する。
 * - 応答が来ているなら必ず実データを返す（空配列含む）
 * - 応答がそもそも無い (null) ときだけモックフォールバック
 */
function transformApiReviews(apiData: Record<string, unknown> | null): Review[] | null {
  if (apiData === null || apiData === undefined) return null
  const rawList = (apiData as { reviews?: unknown[] }).reviews
  const list = Array.isArray(rawList) ? rawList : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return list.map((r: any) => ({
    id: r.reviewId || r.name,
    author: r.reviewer?.displayName || "匿名",
    photoUrl: r.reviewer?.profilePhotoUrl || null,
    rating: parseInt(
      r.starRating
        ?.replace("STAR_RATING_", "")
        .replace("ONE", "1")
        .replace("TWO", "2")
        .replace("THREE", "3")
        .replace("FOUR", "4")
        .replace("FIVE", "5") || "0"
    ),
    date: fmtDateTime(r.createTime) ?? "",
    updatedDate: fmtDateTime(r.updateTime),
    text: r.comment || "",
    reply: r.reviewReply?.comment || null,
    replyDate: fmtDateTime(r.reviewReply?.updateTime),
  }))
}

export default function ReviewsPage() {
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({})
  const [replying, setReplying] = useState<string | null>(null)
  const [openTemplateMenu, setOpenTemplateMenu] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<
    "author" | "rating" | "text" | "date" | "updatedDate" | "replyDate" | "reply"
  >("date")
  const [sortDesc, setSortDesc] = useState(true)
  const { locationName, locations } = useGbp()

  // テンプレートの署名に使う店舗名は「選択中の実店舗名」
  const storeName =
    locations.find((l) => l.name === locationName)?.title ?? mockStoreName

  const { data: apiReviews, loading, refetch } = useGbpData("reviews", null)
  const transformed = transformApiReviews(apiReviews)
  const isDemo = transformed === null
  const reviews: Review[] = useMemo(
    () =>
      transformed ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockReviews as any[]).map((m) => ({
        id: m.id,
        author: m.author,
        photoUrl: null,
        rating: m.rating,
        date: m.date,
        updatedDate: m.date,
        text: m.text,
        reply: m.reply ?? null,
        replyDate: m.replyDate ?? null,
      })),
    [transformed]
  )

  const unrepliedCount = reviews.filter((r) => !r.reply).length
  const repliedCount = reviews.filter((r) => !!r.reply).length

  const filtered = reviews
    .filter((r) => {
      if (filter === "unreplied") return !r.reply
      if (filter === "replied") return !!r.reply
      return true
    })
    .filter((r) => (search ? r.text.includes(search) || r.author.includes(search) : true))

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let va: string | number
      let vb: string | number
      if (sortKey === "rating") {
        va = a.rating
        vb = b.rating
      } else if (sortKey === "reply") {
        va = a.reply ? 1 : 0
        vb = b.reply ? 1 : 0
      } else if (sortKey === "author" || sortKey === "text") {
        va = a[sortKey] ?? ""
        vb = b[sortKey] ?? ""
        return sortDesc
          ? String(vb).localeCompare(String(va), "ja")
          : String(va).localeCompare(String(vb), "ja")
      } else {
        // 日付系（未設定は最小扱い）
        va = a[sortKey] ? new Date(a[sortKey] as string).getTime() : 0
        vb = b[sortKey] ? new Date(b[sortKey] as string).getTime() : 0
      }
      return sortDesc ? Number(vb) - Number(va) : Number(va) - Number(vb)
    })
    return arr
  }, [filtered, sortKey, sortDesc])

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  /** クチコミをCSVで書き出す（Excelで開ける） */
  const handleDownload = () => {
    const head = [
      "投稿者名","評価","コメント","初回投稿日","最新更新日","最新返信日","返信","感情分析",
    ]
    const lines = [head.join(",")]
    for (const r of sorted) {
      const s2 = analyzeSentiment(r.rating, r.text)
      const cells = [
        r.author, r.rating, r.text, r.date, r.updatedDate ?? "", r.replyDate ?? "",
        r.reply ? "済" : "未", s2.label,
      ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      lines.push(cells.join(","))
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `reviews-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleSelectTemplate = (reviewId: string, author: string, templateText: string) => {
    setReplyTexts((prev) => ({
      ...prev,
      [reviewId]: applyTemplate(templateText, { author, storeName }),
    }))
    setOpenTemplateMenu(null)
  }

  const handleAutoFillAll = () => {
    const newTexts: Record<string, string> = {}
    for (const review of reviews.filter((r) => !r.reply)) {
      if (!replyTexts[review.id]) {
        const templates = getTemplatesForRating(review.rating)
        if (templates.length > 0) {
          newTexts[review.id] = applyTemplate(templates[0].template, {
            author: review.author,
            storeName,
          })
        }
      }
    }
    setReplyTexts((prev) => ({ ...prev, ...newTexts }))
  }

  const handleReply = async (reviewId: string) => {
    const comment = replyTexts[reviewId]
    if (!comment || !locationName) return
    setReplying(reviewId)
    try {
      const res = await fetch("/api/gbp/reviews", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewName: `${locationName}/reviews/${reviewId}`,
          comment,
        }),
      })
      if (res.ok) {
        setReplyTexts((prev) => ({ ...prev, [reviewId]: "" }))
        setExpanded(null)
        refetch()
      }
    } catch (err) {
      console.error("Reply failed:", err)
    } finally {
      setReplying(null)
    }
  }

  const TABS = [
    { key: "all", label: "すべて", count: reviews.length },
    { key: "unreplied", label: "未返信", count: unrepliedCount },
    { key: "replied", label: "返信済み", count: repliedCount },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">クチコミ管理</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {unrepliedCount > 0 && (
            <button
              onClick={handleAutoFillAll}
              className="flex items-center gap-1.5 bg-[#2c3e50] text-white px-4 py-2 rounded text-sm hover:bg-[#34495e]"
            >
              <FileText className="h-4 w-4" />
              未返信{unrepliedCount}件にテンプレート一括適用
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={sorted.length === 0}
            className="flex items-center gap-1.5 border border-gray-300 bg-white px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            ダウンロード
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> データを取得中...
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex gap-2">
          {TABS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-sm rounded border ${
                filter === f.key
                  ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                  : "bg-white border-gray-300 hover:bg-gray-50"
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="クチコミを検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded pl-9 pr-3 py-1.5 text-sm"
          />
        </div>
        <span className="text-sm text-muted-foreground ml-auto">{filtered.length}件</span>
      </div>

      {isDemo && !loading && (
        <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded p-3">
          デモ表示中（モックデータ）。上部の店舗セレクタで店舗を選択すると実データに切り替わります。
        </div>
      )}

      {!isDemo && !loading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {reviews.length === 0
              ? "この店舗にはまだクチコミがありません"
              : "条件に一致するクチコミがありません"}
          </p>
        </div>
      )}

      {/* Review Table */}
      {filtered.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {(
                  [
                    { key: "author", label: "投稿者名" },
                    { key: "rating", label: "評価" },
                    { key: "text", label: "コメント" },
                    { key: "date", label: "初回投稿日" },
                    { key: "updatedDate", label: "最新更新日" },
                    { key: "replyDate", label: "最新返信日" },
                    { key: "reply", label: "返信" },
                  ] as const
                ).map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className="text-left px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:text-gray-700"
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <ChevronsUpDown
                        className={`h-3 w-3 ${sortKey === col.key ? "text-[#4a90e2]" : "text-gray-300"}`}
                      />
                    </span>
                  </th>
                ))}
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">感情分析</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">WF承認</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((review) => {
                const templates = getTemplatesForRating(review.rating)
                const sentiment = analyzeSentiment(review.rating, review.text)
                const isOpen = expanded === review.id
                return (
                  <Fragment key={review.id}>
                    <tr className="border-t align-top hover:bg-gray-50/60">
                      {/* 投稿者名（アイコン付き） */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-[130px]">
                          {review.photoUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={review.photoUrl}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover shrink-0 bg-gray-100"
                            />
                          ) : (
                            <span
                              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold"
                              style={{ backgroundColor: avatarColor(review.author) }}
                            >
                              {avatarLabel(review.author)}
                            </span>
                          )}
                          <span className="font-medium">{review.author}</span>
                        </div>
                      </td>

                      {/* 評価 */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3.5 w-3.5 ${
                                i < review.rating
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                      </td>

                      {/* コメント */}
                      <td className="px-3 py-2.5 min-w-[260px] max-w-[420px]">
                        <p className="whitespace-pre-wrap break-words line-clamp-3">
                          {review.text || <span className="text-[#4a90e2]">コメントなし</span>}
                        </p>
                      </td>

                      {/* 初回投稿日 / 最新更新日 / 最新返信日 */}
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">{review.date || "—"}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {review.updatedDate ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {review.replyDate ?? "—"}
                      </td>

                      {/* 返信 */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {review.reply ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                            済
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                              未
                            </span>
                            <button
                              onClick={() => setExpanded(isOpen ? null : review.id)}
                              className="text-xs px-2.5 py-1 rounded bg-[#4a90e2] text-white hover:bg-[#3a7cc8]"
                            >
                              {isOpen ? "閉じる" : "返信"}
                            </button>
                          </div>
                        )}
                      </td>

                      {/* 感情分析（星評価＋本文の語調によるルール判定） */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          title={sentiment.hint}
                          className={`text-xs px-2 py-0.5 rounded ${
                            sentiment.sentiment === "positive"
                              ? "bg-green-100 text-green-700"
                              : sentiment.sentiment === "negative"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {sentiment.label}
                        </span>
                      </td>

                      {/* WF承認（ワークフロー機能は未導入） */}
                      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                        WFなし
                      </td>
                    </tr>

                    {/* 既存の返信本文 */}
                    {review.reply && (
                      <tr className="border-t-0">
                        <td />
                        <td />
                        <td colSpan={7} className="px-3 pb-3">
                          <div className="bg-gray-50 rounded p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <MessageSquare className="h-3 w-3 text-blue-500" />
                              <span className="text-xs font-medium text-blue-500">
                                オーナーからの返信
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {review.replyDate}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{review.reply}</p>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* 返信フォーム */}
                    {isOpen && !review.reply && (
                      <tr className="border-t-0">
                        <td />
                        <td />
                        <td colSpan={7} className="px-3 pb-4">
                          <div className="relative mb-2">
                            <button
                              onClick={() =>
                                setOpenTemplateMenu(
                                  openTemplateMenu === review.id ? null : review.id
                                )
                              }
                              className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-100"
                            >
                              <FileText className="h-3 w-3" />
                              テンプレートから選択
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            {openTemplateMenu === review.id && (
                              <div className="absolute z-10 mt-1 bg-white border rounded-lg shadow-lg w-80 max-h-60 overflow-y-auto">
                                {templates.map((tmpl) => (
                                  <button
                                    key={tmpl.id}
                                    onClick={() =>
                                      handleSelectTemplate(review.id, review.author, tmpl.template)
                                    }
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b last:border-b-0"
                                  >
                                    <span className="font-medium">{tmpl.label}</span>
                                    <p className="text-muted-foreground mt-0.5 line-clamp-2">
                                      {applyTemplate(tmpl.template, {
                                        author: review.author,
                                        storeName,
                                      }).substring(0, 80)}
                                      ...
                                    </p>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <textarea
                            placeholder="返信を入力... またはテンプレートから選択できます"
                            value={replyTexts[review.id] || ""}
                            onChange={(e) =>
                              setReplyTexts((prev) => ({ ...prev, [review.id]: e.target.value }))
                            }
                            className="w-full border rounded px-3 py-2 text-sm h-28"
                          />
                          <div className="flex justify-end mt-2 gap-2">
                            {replyTexts[review.id] && (
                              <button
                                onClick={() =>
                                  setReplyTexts((prev) => ({ ...prev, [review.id]: "" }))
                                }
                                className="text-xs text-gray-500 hover:underline"
                              >
                                クリア
                              </button>
                            )}
                            <button
                              onClick={() => handleReply(review.id)}
                              disabled={replying === review.id || !replyTexts[review.id]}
                              className="bg-[#2c3e50] text-white px-4 py-1.5 rounded text-sm hover:bg-[#34495e] disabled:opacity-50 flex items-center gap-1"
                            >
                              {replying === review.id && (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              )}
                              返信する
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-muted-foreground mt-3">
        ※ 感情分析は星評価と本文の語調による自動判定です。WF（ワークフロー）承認機能は未導入のため「WFなし」と表示されます。
      </p>
    </div>
  )
}
