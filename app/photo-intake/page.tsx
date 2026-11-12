"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { fetchJson } from "@/lib/fetch-json"
import { normalizeSearchText } from "@/lib/search-normalize"
import { AlertCircle, Camera, Copy, ExternalLink, Loader2, Search } from "lucide-react"

/**
 * 写真の受付ページ（管理）。
 *
 * 店舗ごとに「お客様がスマホから写真を送れるURL」を発行する。
 * 届いた写真は、その店舗の画像アーカイブに自動で入るので、投稿の画面からそのまま選べる。
 * ここからは Google に何も送らない。
 */

interface Row {
  locationName: string
  title: string
  token: string | null
  enabled: boolean
  total: number
  unseen: number
  lastAt: string | null
}
interface Upload {
  id: number
  url: string
  fileName: string | null
  senderName: string | null
  note: string | null
  seen: boolean
  createdAt: string
}

function fmt(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function PhotoIntakeAdminPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [uploads, setUploads] = useState<Upload[] | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const r = await fetchJson<{ stores: Row[] }>("/api/photo-intake")
      if (!r.ok || !r.data) throw new Error(r.error ?? "読み込めませんでした")
      setRows(r.data.stores)
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

  const urlOf = (token: string) => `${window.location.origin}/share/photos/${token}`

  const call = async (
    method: "POST" | "PATCH",
    locationName: string,
    body: Record<string, unknown> = {}
  ) => {
    setBusy(locationName)
    setError(null)
    try {
      const r = await fetchJson("/api/photo-intake", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationName, ...body }),
      })
      if (!r.ok) throw new Error(r.error ?? "変更できませんでした")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(urlOf(token))
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setError("コピーできませんでした。「開く」で表示したページのURLをお使いください。")
    }
  }

  const toggleOpen = async (row: Row) => {
    if (open === row.locationName) {
      setOpen(null)
      return
    }
    setOpen(row.locationName)
    setUploads(null)
    setQr(null)
    if (row.token) {
      QRCode.toDataURL(urlOf(row.token), { margin: 1, width: 320 })
        .then(setQr)
        .catch(() => setQr(null))
    }
    const r = await fetchJson<{ uploads: Upload[] }>(
      `/api/photo-intake?locationName=${encodeURIComponent(row.locationName)}`
    )
    setUploads(r.ok && r.data ? r.data.uploads : [])
  }

  const removeUpload = async (row: Row, id: number) => {
    if (!confirm("この写真を削除します。画像アーカイブからも消え、元に戻せません。よろしいですか？")) return
    const r = await fetchJson(`/api/photo-intake?id=${id}`, { method: "DELETE" })
    if (!r.ok) {
      setError(r.error ?? "削除できませんでした")
      return
    }
    setUploads((prev) => (prev ? prev.filter((u) => u.id !== id) : prev))
    load()
  }

  const totalUnseen = rows.reduce((a, r) => a + r.unseen, 0)
  const issued = rows.filter((r) => r.token && r.enabled).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Camera className="h-6 w-6" />
          写真の受付ページ
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          店舗ごとに、お客様がスマホから写真を送れる専用のURLを発行します。
          <br />
          届いた写真は、その店舗の画像アーカイブに自動で入り、投稿の画面からそのまま選べます。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <p className="text-sm">
          受付中 <span className="font-bold">{issued}</span> 店舗 ／ まだ確認していない写真{" "}
          <span className={`font-bold ${totalUnseen > 0 ? "text-amber-700" : ""}`}>{totalUnseen}</span>{" "}
          枚
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
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">受付URL</th>
                <th className="text-right px-3 py-2 font-normal whitespace-nowrap">届いた写真</th>
                <th className="text-left px-3 py-2 font-normal whitespace-nowrap">最後に届いた日時</th>
                <th className="px-3 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                    読み込んでいます…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
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
                        {!r.token ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === r.locationName}
                            onClick={() => call("POST", r.locationName)}
                          >
                            URLを発行
                          </Button>
                        ) : r.enabled ? (
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-green-700">受付中</span>
                            <Button size="sm" variant="outline" onClick={() => copy(r.token!)}>
                              <Copy className="h-3.5 w-3.5" />
                              {copied === r.token ? "コピーしました" : "URLをコピー"}
                            </Button>
                            <a href={`/share/photos/${r.token}`} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="ghost">
                                <ExternalLink className="h-3.5 w-3.5" />
                                開く
                              </Button>
                            </a>
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">止めています</span>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === r.locationName}
                              onClick={() => call("PATCH", r.locationName, { enabled: true })}
                            >
                              受付を再開
                            </Button>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {r.total} 枚
                        {r.unseen > 0 && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            未確認 {r.unseen}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmt(r.lastAt)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {r.token && (
                          <Button size="sm" variant="outline" onClick={() => toggleOpen(r)}>
                            {open === r.locationName ? "閉じる" : "写真とQRコードを見る"}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {open === r.locationName && r.token && (
                      <tr className="border-t bg-gray-50">
                        <td colSpan={5} className="px-3 py-4">
                          <div className="flex flex-wrap gap-6">
                            <div className="w-44 shrink-0 space-y-2">
                              {qr ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={qr} alt="受付ページのQRコード" className="w-40 h-40 border bg-white" />
                              ) : (
                                <div className="w-40 h-40 border bg-white" />
                              )}
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                このQRコードをスマホで読み取ると、受付ページが開きます。
                              </p>
                              <p className="text-xs break-all select-all">{urlOf(r.token)}</p>
                              <div className="flex flex-col gap-1 pt-1">
                                <button
                                  type="button"
                                  className="text-xs text-left text-[#4a90e2] hover:underline"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "この店舗の受付を止めます。お渡し済みのURLからは送れなくなります（あとで再開できます）。"
                                      )
                                    )
                                      call("PATCH", r.locationName, { enabled: false })
                                  }}
                                >
                                  受付を止める
                                </button>
                                <button
                                  type="button"
                                  className="text-xs text-left text-[#4a90e2] hover:underline"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "URLを作り直します。いまのURLは使えなくなるので、お客様に新しいURLをお渡しください。"
                                      )
                                    )
                                      call("PATCH", r.locationName, { rotate: true }).then(() => setOpen(null))
                                  }}
                                >
                                  URLを作り直す
                                </button>
                              </div>
                            </div>
                            <div className="flex-1 min-w-72 space-y-3">
                              <div className="flex items-center gap-3">
                                <p className="text-sm font-medium">届いた写真</p>
                                {r.unseen > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      call("PATCH", r.locationName, { markSeen: true }).then(() =>
                                        setUploads((prev) => prev?.map((u) => ({ ...u, seen: true })) ?? prev)
                                      )
                                    }
                                  >
                                    すべて確認済みにする
                                  </Button>
                                )}
                              </div>
                              {uploads === null && (
                                <p className="text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin inline-block mr-1" />
                                  読み込んでいます…
                                </p>
                              )}
                              {uploads && uploads.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                  まだ届いていません。URLかQRコードをお客様にお渡しください。
                                </p>
                              )}
                              {uploads && uploads.length > 0 && (
                                <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                  {uploads.map((u) => (
                                    <li key={u.id} className="text-xs space-y-1">
                                      <a href={u.url} target="_blank" rel="noreferrer">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={u.url}
                                          alt=""
                                          loading="lazy"
                                          className="w-full aspect-square object-cover border bg-white"
                                        />
                                      </a>
                                      <p className="text-muted-foreground">
                                        {fmt(u.createdAt)}
                                        {!u.seen && <span className="ml-1 text-amber-700">未確認</span>}
                                      </p>
                                      {u.senderName && <p>{u.senderName} さん</p>}
                                      {u.note && <p className="text-muted-foreground">{u.note}</p>}
                                      <button
                                        type="button"
                                        className="text-red-600 hover:underline"
                                        onClick={() => removeUpload(r, u.id)}
                                      >
                                        削除
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                ここの写真は、この店舗の投稿画面の「画像アーカイブ」に入っています（ファイル名が
                                okyakusama で始まるもの）。
                              </p>
                            </div>
                          </div>
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
