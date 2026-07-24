"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import QRCode from "qrcode"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Plus,
  Copy,
  QrCode,
  Trash2,
  CopyPlus,
  Pencil,
  AlertCircle,
  X,
  CheckCircle2,
  ExternalLink,
  Download,
} from "lucide-react"

interface SurveyRow {
  id: number
  token: string
  name: string
  description: string | null
  urlMode: string
  storeSelectMode: string
  targetStores: string[] | null
  questions: { title: string; type: string; choices: { label: string }[] }[]
  collectRespondent: boolean
  status: string
  updatedAt: string
  responseCount: number
}

export default function SurveysPage() {
  const router = useRouter()
  const [rows, setRows] = useState<SurveyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [qrModal, setQrModal] = useState<{
    token: string
    name: string
    url: string
    dataUrl: string
    storeId: string
  } | null>(null)
  const [stores, setStores] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    fetch("/api/stores?status=active&limit=2000")
      .then((r) => r.json())
      .then((j) =>
        setStores(
          (j.stores ?? []).map((s: { locationName: string; title: string }) => ({
            id: s.locationName.replace(/^locations\//, ""),
            title: s.title,
          }))
        )
      )
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/surveys")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setRows(j.surveys)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const surveyUrl = (token: string) => `${window.location.origin}/s/${token}`

  const copyUrl = async (row: SurveyRow) => {
    await navigator.clipboard.writeText(surveyUrl(row.token))
    setCopiedId(row.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const showQr = async (row: SurveyRow, storeId = "") => {
    const url = storeId
      ? `${surveyUrl(row.token)}?store=${storeId}`
      : surveyUrl(row.token)
    const dataUrl = await QRCode.toDataURL(url, { width: 480, margin: 2 })
    setQrModal({ token: row.token, name: row.name, url, dataUrl, storeId })
  }

  const duplicate = async (row: SurveyRow) => {
    const res = await fetch("/api/surveys/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id }),
    })
    const j = await res.json()
    if (!res.ok) {
      setError(j.error || "複製に失敗しました")
      return
    }
    await load()
  }

  const toggleStatus = async (row: SurveyRow) => {
    const next = row.status === "active" ? "closed" : "active"
    const res = await fetch(`/api/surveys?id=${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    if (res.ok) await load()
  }

  const remove = async (row: SurveyRow) => {
    if (
      !confirm(
        `「${row.name}」を削除しますか？\n回答データ（${row.responseCount}件）もすべて削除されます。`
      )
    )
      return
    const res = await fetch(`/api/surveys?id=${row.id}`, { method: "DELETE" })
    if (res.ok) await load()
  }

  /** 店舗ごとURLのCSVダウンロード（per_store モード用） */
  const downloadPerStoreCsv = async (row: SurveyRow) => {
    const res = await fetch(`/api/public/surveys/${row.token}`)
    const j = await res.json()
    if (!res.ok) {
      setError(j.error || "店舗リストの取得に失敗しました")
      return
    }
    const lines = ["店舗名,アンケートURL"]
    for (const s of j.stores as { id: string; title: string }[]) {
      lines.push(`"${s.title.replace(/"/g, '""')}",${surveyUrl(row.token)}?store=${s.id}`)
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `survey_urls_${row.id}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">アンケート一覧</h1>
          <p className="text-sm text-muted-foreground mt-1">
            アンケートに一度でも回答が付くと内容の編集ができなくなります（複製で改訂してください）。
            URLやQRコードを配布して回答を集め、満足なお客様はGoogleレビューへ誘導できます。
          </p>
        </div>
        <Button onClick={() => router.push("/surveys/new")}>
          <Plus className="h-4 w-4" /> 新規作成
        </Button>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">NO</th>
                <th className="text-left px-3 py-2 font-medium">アンケート名</th>
                <th className="text-left px-3 py-2 font-medium">概要</th>
                <th className="text-left px-3 py-2 font-medium">URL</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">種別</th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">回答件数</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">更新日</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">状態</th>
                <th className="text-left px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-muted-foreground">
                    アンケートがまだありません。「新規作成」から作成してください。
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={row.id} className={`border-t ${row.status !== "active" ? "opacity-60" : ""}`}>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                    {row.description ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyUrl(row)}
                        className="text-xs text-[#4a90e2] hover:underline flex items-center gap-1 whitespace-nowrap"
                        title="回答URLをコピー"
                      >
                        {copiedId === row.id ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-green-600" /> コピー済み
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> URLコピー
                          </>
                        )}
                      </button>
                      <a
                        href={`/s/${row.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-400 hover:text-gray-600 p-1"
                        title="プレビュー"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => showQr(row)}
                        className="text-gray-400 hover:text-gray-600 p-1"
                        title="QRコード表示"
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                      {row.urlMode === "per_store" && (
                        <button
                          onClick={() => downloadPerStoreCsv(row)}
                          className="text-gray-400 hover:text-gray-600 p-1"
                          title="店舗ごとURL一覧（CSV）"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {row.urlMode === "per_store" ? "店舗ごとURL" : "グループ共通URL"}
                  </td>
                  <td className="px-3 py-2 text-right">{row.responseCount}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {new Date(row.updatedAt).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleStatus(row)}
                      className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                        row.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-600"
                      }`}
                      title="クリックで公開/停止を切替"
                    >
                      {row.status === "active" ? "公開中" : "停止中"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      {row.responseCount === 0 ? (
                        <button
                          onClick={() => router.push(`/surveys/new?id=${row.id}`)}
                          className="text-xs text-[#4a90e2] hover:underline flex items-center gap-1"
                        >
                          <Pencil className="h-3 w-3" /> 編集
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400" title="回答があるため編集不可">
                          編集不可
                        </span>
                      )}
                      <button
                        onClick={() => duplicate(row)}
                        className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
                      >
                        <CopyPlus className="h-3 w-3" /> 複製
                      </button>
                      <button
                        onClick={() => remove(row)}
                        className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" /> 削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* QRモーダル */}
      {qrModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full text-center relative">
            <button
              onClick={() => setQrModal(null)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="font-bold mb-3 text-sm">{qrModal.name}</h2>
            {/* 店舗固定QR: 選ぶと ?store= 付きURLになり回答画面の店舗選択が消える */}
            <select
              value={qrModal.storeId}
              onChange={(e) => {
                const row = rows.find((r) => r.token === qrModal.token)
                if (row) showQr(row, e.target.value)
              }}
              className="w-full h-9 px-2 text-xs border rounded mb-3"
            >
              <option value="">全店舗共通QR（回答画面で店舗を選択）</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  店舗固定: {s.title}
                </option>
              ))}
            </select>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrModal.dataUrl} alt="QRコード" className="mx-auto w-56 h-56" />
            <p className="text-xs text-gray-500 mt-2 break-all">{qrModal.url}</p>
            <a
              href={qrModal.dataUrl}
              download="survey_qr.png"
              className="inline-flex items-center gap-1 text-xs text-[#4a90e2] hover:underline mt-3"
            >
              <Download className="h-3 w-3" /> QR画像をダウンロード
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
