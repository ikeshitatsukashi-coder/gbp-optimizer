"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useGbp } from "@/lib/store"
import { deriveStoreGroup } from "@/lib/store-group"
import {
  Loader2,
  Trash2,
  AlertCircle,
  Download,
  Printer,
  RefreshCw,
  Star,
  FileCheck2,
} from "lucide-react"

interface FlagRecord {
  flaggedAt: string | null
  status: string | null
  requestMethod: string | null
  requestedBy: string | null
  note: string | null
}

interface ReportItem {
  reviewName: string
  locationName: string
  storeName: string
  reviewer: string | null
  starRating: number | null
  comment: string | null
  replyComment: string | null
  createTime: string | null
  deletedDetectedAt: string | null
  flag: FlagRecord | null
}

interface Summary {
  total: number
  requested: number
  notRequested: number
  withComment: number
  lowRating: number
  avgRating: number | null
  stores: number
}

const METHOD_LABEL: Record<string, string> = {
  api: "ツールから送信",
  gbp_ui: "GBP管理画面から申請",
  google_form: "Googleのフォームから申請",
  other: "その他",
}

const STATUS_LABEL: Record<string, string> = {
  manual: "申請済み（手動）",
  submitted: "申請済み",
  approved: "Google承認",
  already_reported: "既に報告済み",
  rejected: "却下",
  failed: "送信エラー",
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}`
}

/** 今日からNか月前のYYYY-MM-DD */
function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`
}

/**
 * Googleは外国語判定したクチコミを
 *   "(Translated by Google) <訳文>\n\n(Original)\n<原文>"
 * の形で返す。お客様報告では原文（日本語）だけを見せる。
 */
function preferOriginal(text: string | null): string {
  if (!text) return ""
  const i = text.indexOf("(Original)")
  if (i === -1) return text
  return text.slice(i + "(Original)".length).trim()
}

export default function DeletionReportPage() {
  const { locations, locationName } = useGbp()

  const [scope, setScope] = useState<"store" | "group" | "all">("store")
  const [group, setGroup] = useState("")
  const [from, setFrom] = useState(monthsAgo(3))
  const [to, setTo] = useState(today())

  const [items, setItems] = useState<ReportItem[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentStore = useMemo(
    () => locations.find((l) => l.name === locationName),
    [locations, locationName]
  )

  /** 店舗名から会社名（グループ）の候補を作る */
  const groupOptions = useMemo(() => {
    const set = new Set<string>()
    for (const l of locations) {
      const g = deriveStoreGroup(l.title ?? "")
      if (g) set.add(g)
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ja"))
  }, [locations])

  // 店舗が切り替わったらグループ候補も追従させる
  useEffect(() => {
    if (currentStore && !group) {
      setGroup(deriveStoreGroup(currentStore.title ?? ""))
    }
  }, [currentStore, group])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (scope === "store") {
        if (!locationName) {
          setItems([])
          setSummary(null)
          setError("画面上部の店舗セレクタで店舗を選択してください")
          return
        }
        params.set("locationName", locationName)
      } else if (scope === "group") {
        if (!group) {
          setError("グループ（会社名）を選択してください")
          return
        }
        params.set("group", group)
      }
      if (from) params.set("from", from)
      if (to) params.set("to", to)

      const res = await fetch(`/api/reviews/deletion-report?${params.toString()}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setItems(j.items)
      setSummary(j.summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [scope, locationName, group, from, to])

  useEffect(() => {
    load()
  }, [load])

  const downloadCsv = () => {
    const header = [
      "店舗名",
      "投稿者",
      "評価",
      "クチコミ本文",
      "当社の返信",
      "投稿日",
      "削除確認日",
      "削除申請",
      "申請日",
      "申請方法",
      "備考",
    ]
    const lines = [header.map(csvEscape).join(",")]
    for (const i of items) {
      lines.push(
        [
          i.storeName ?? "",
          i.reviewer ?? "",
          i.starRating != null ? String(i.starRating) : "",
          preferOriginal(i.comment).replace(/\r?\n/g, " "),
          preferOriginal(i.replyComment).replace(/\r?\n/g, " "),
          fmtDate(i.createTime),
          fmtDate(i.deletedDetectedAt),
          i.flag ? (STATUS_LABEL[i.flag.status ?? ""] ?? i.flag.status ?? "") : "申請記録なし",
          i.flag ? fmtDate(i.flag.flaggedAt) : "",
          i.flag ? (METHOD_LABEL[i.flag.requestMethod ?? ""] ?? "") : "",
          i.flag?.note ?? "",
        ]
          .map(csvEscape)
          .join(",")
      )
    }
    // Excelで文字化けしないよう BOM を付ける
    const blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `削除クチコミレポート_${from}_${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const scopeLabel =
    scope === "store"
      ? (currentStore?.title ?? "（店舗未選択）")
      : scope === "group"
        ? `${group}（グループ全体）`
        : "全店舗"

  return (
    <div className="p-6 space-y-4">
      <style>{`@media print {
        aside, header, .no-print { display: none !important; }
        html, body { height: auto !important; overflow: visible !important; display: block !important; background: white !important; }
        body > div, main { overflow: visible !important; height: auto !important; display: block !important; }
        main { padding: 0 !important; }
        .print-card { break-inside: avoid; box-shadow: none !important; }
        table { font-size: 10px !important; }
        tr { break-inside: avoid; }
        /* 画面では6行で省略、印刷（お客様提出）では全文を出す */
        .print-full { -webkit-line-clamp: unset !important; display: block !important; max-width: none !important; }
      }`}</style>

      {/* 画面用ヘッダー */}
      <div className="flex items-start justify-between gap-4 flex-wrap no-print">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-[#2c3e50]" />
            削除クチコミレポート（クライアント報告用）
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Googleから消えたクチコミを、削除申請の記録と突き合わせて一覧化します。
            「印刷 / PDF保存」でそのままお客様に提出できる体裁で出力できます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            更新
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            disabled={items.length === 0}
          >
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
          <Button size="sm" onClick={() => window.print()} disabled={items.length === 0}>
            <Printer className="h-4 w-4 mr-1" />
            印刷 / PDF保存
          </Button>
        </div>
      </div>

      {/* 条件 */}
      <Card className="p-4 no-print">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">対象</label>
            <div className="flex rounded border overflow-hidden">
              {(
                [
                  ["store", "選択中の店舗"],
                  ["group", "グループ"],
                  ["all", "全店舗"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setScope(k)}
                  className={`px-3 py-1.5 text-sm ${
                    scope === k
                      ? "bg-[#2c3e50] text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {scope === "group" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">グループ（会社名）</label>
              <input
                list="group-options"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="例: 株式会社アイ・リンク"
                className="h-9 w-64 rounded border px-2 text-sm"
              />
              <datalist id="group-options">
                {groupOptions.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">期間（削除確認日）</label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded border px-2 text-sm"
              />
              <span className="text-gray-400">〜</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded border px-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-1">
            {(
              [
                ["今月", 0],
                ["3ヶ月", 3],
                ["6ヶ月", 6],
                ["1年", 12],
              ] as const
            ).map(([label, n]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setFrom(n === 0 ? today().slice(0, 8) + "01" : monthsAgo(n))
                  setTo(today())
                }}
                className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 no-print">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 no-print">
          <Loader2 className="h-4 w-4 animate-spin" />
          集計中…
        </div>
      )}

      {/* ここから印刷対象 */}
      {summary && !loading && (
        <>
          {/* 報告書ヘッダー（印刷時のみ意味を持つ） */}
          <div className="print-card">
            <div className="border-b pb-3 mb-1">
              <h2 className="text-lg font-bold">クチコミ削除 実施報告</h2>
              <div className="mt-1 text-sm text-gray-600 flex flex-wrap gap-x-6 gap-y-1">
                <span>対象：{scopeLabel}</span>
                <span>
                  期間：{fmtDate(from)} 〜 {fmtDate(to)}
                </span>
                <span>作成日：{fmtDate(today())}</span>
              </div>
            </div>
          </div>

          {/* サマリー */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 print-card">
            <Card className="p-3">
              <div className="text-xs text-gray-500">削除が確認されたクチコミ</div>
              <div className="text-2xl font-bold mt-1">
                {summary.total}
                <span className="text-sm font-normal text-gray-500 ml-1">件</span>
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-gray-500">うち 当社から削除申請</div>
              <div className="text-2xl font-bold mt-1 text-green-700">
                {summary.requested}
                <span className="text-sm font-normal text-gray-500 ml-1">件</span>
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-gray-500">★2以下だったもの</div>
              <div className="text-2xl font-bold mt-1">
                {summary.lowRating}
                <span className="text-sm font-normal text-gray-500 ml-1">件</span>
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-gray-500">削除された評価の平均</div>
              <div className="text-2xl font-bold mt-1">
                {summary.avgRating != null ? `★${summary.avgRating}` : "—"}
              </div>
            </Card>
          </div>

          {items.length === 0 ? (
            <Card className="p-10 text-center text-gray-500">
              この条件で削除が確認されたクチコミはありません。
              <div className="text-xs mt-2">
                削除の検知はクチコミ同期のタイミングで行われます。
                最近の削除が反映されていない場合は「クチコミ管理」から同期を実行してください。
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden print-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-600">
                    <tr>
                      <th className="px-3 py-2 font-medium w-10">No</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">店舗</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">投稿者</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap w-14">評価</th>
                      <th className="px-3 py-2 font-medium">クチコミ本文</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">投稿日</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">削除確認日</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">削除申請</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y align-top">
                    {items.map((i, idx) => (
                      <tr key={i.reviewName}>
                        <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{i.storeName}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{i.reviewer ?? "—"}</td>
                        <td className="px-3 py-2">
                          {i.starRating != null ? (
                            <span
                              className={`inline-flex items-center gap-0.5 whitespace-nowrap font-medium ${
                                i.starRating <= 2 ? "text-red-600" : "text-gray-700"
                              }`}
                            >
                              <Star className="h-3 w-3 fill-current" />
                              {i.starRating}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="whitespace-pre-wrap break-words text-gray-700 min-w-[240px] max-w-[520px] line-clamp-6 print-full">
                            {preferOriginal(i.comment).trim()
                              ? preferOriginal(i.comment)
                              : "（本文なし・評価のみ）"}
                          </div>
                          {i.replyComment && (
                            <div className="mt-1 border-l-2 border-gray-200 pl-2 text-xs text-gray-500 whitespace-pre-wrap break-words">
                              当社返信：{preferOriginal(i.replyComment)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                          {fmtDate(i.createTime)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                          {fmtDate(i.deletedDetectedAt)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {i.flag ? (
                            <div>
                              <div className="text-green-700 font-medium">
                                {STATUS_LABEL[i.flag.status ?? ""] ?? i.flag.status}
                              </div>
                              <div className="text-[11px] text-gray-500">
                                {fmtDate(i.flag.flaggedAt)}
                                {i.flag.requestMethod && (
                                  <> / {METHOD_LABEL[i.flag.requestMethod] ?? ""}</>
                                )}
                              </div>
                              {i.flag.note && (
                                <div className="text-[11px] text-gray-500">
                                  {i.flag.note}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">申請記録なし</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* 注記（報告書としての但し書き） */}
          {items.length > 0 && (
            <div className="text-xs text-gray-500 space-y-1 print-card">
              <p className="flex items-start gap-1">
                <Trash2 className="h-3 w-3 mt-0.5 shrink-0" />
                「削除確認日」は当ツールがGoogleビジネスプロフィール上からクチコミの消失を確認した日です。
                Googleが実際に削除した日時とは前後する場合があります。
              </p>
              <p>
                「申請記録なし」のクチコミは、投稿者ご自身による削除、またはGoogleの判断による削除と考えられます。
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
