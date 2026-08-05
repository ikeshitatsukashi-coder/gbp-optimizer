"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Building2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Trash2,
  Info,
  Link2,
  Unlink,
} from "lucide-react"
import { fetchJsonRetry } from "@/lib/fetch-json"

/**
 * 会社マスタと、店舗を会社に紐づける画面。
 *
 * 店舗名からの自動判定は必ず外れるため、この画面は「候補を出すところまで」しかやらない。
 * 実際の紐づけは、内容を見た人がボタンを押して確定する。
 */

interface CompanyRow {
  id: number
  code: string
  name: string
  notes: string | null
  storeCount: number
}

interface SuggestionGroup {
  companyName: string
  key: string
  stores: { locationName: string; title: string }[]
}

interface CompanyStore {
  locationName: string
  title: string
  status: string
}

export default function CompaniesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [suggestions, setSuggestions] = useState<SuggestionGroup[]>([])
  const [unassignedCount, setUnassignedCount] = useState(0)

  /** 展開している候補グループ */
  const [openKey, setOpenKey] = useState<string | null>(null)
  /** グループごとの「確定に含める店舗」 */
  const [picked, setPicked] = useState<Record<string, Set<string>>>({})
  /** グループごとに編集した会社名 */
  const [nameEdit, setNameEdit] = useState<Record<string, string>>({})
  /** グループごとの会社コード（空欄なら自動採番） */
  const [codeEdit, setCodeEdit] = useState<Record<string, string>>({})
  /** 既存の会社に紐づける場合の選択 */
  const [existingPick, setExistingPick] = useState<Record<string, string>>({})

  /** 会社の詳細（所属店舗）を開いているID */
  const [openCompanyId, setOpenCompanyId] = useState<number | null>(null)
  const [companyStores, setCompanyStores] = useState<CompanyStore[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetchJsonRetry<{
        companies: CompanyRow[]
        suggestions: SuggestionGroup[]
        unassignedCount: number
      }>("/api/companies?suggest=1")
      if (!r.ok) throw new Error(r.error ?? "読み込みに失敗しました")
      setCompanies(r.data?.companies ?? [])
      setSuggestions(r.data?.suggestions ?? [])
      setUnassignedCount(r.data?.unassignedCount ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 4000)
  }

  /** グループを開くとき、既定で全店舗にチェックを入れる */
  const toggleGroup = (g: SuggestionGroup) => {
    if (openKey === g.key) {
      setOpenKey(null)
      return
    }
    setOpenKey(g.key)
    if (!picked[g.key]) {
      setPicked((p) => ({
        ...p,
        [g.key]: new Set(g.stores.map((s) => s.locationName)),
      }))
    }
    if (nameEdit[g.key] === undefined) {
      setNameEdit((n) => ({ ...n, [g.key]: g.companyName }))
    }
  }

  const toggleStore = (key: string, locationName: string) => {
    setPicked((p) => {
      const set = new Set(p[key] ?? [])
      if (set.has(locationName)) set.delete(locationName)
      else set.add(locationName)
      return { ...p, [key]: set }
    })
  }

  /** 新しい会社として作成し、選んだ店舗を紐づける */
  const createAndAssign = async (g: SuggestionGroup, override?: string[]) => {
    const name = (nameEdit[g.key] ?? g.companyName).trim()
    const locationNames = override ?? [...(picked[g.key] ?? [])]
    if (!name) {
      setError("会社名を入力してください")
      return
    }
    if (locationNames.length === 0) {
      setError("紐づける店舗を1つ以上選んでください")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const r = await fetchJsonRetry<{ company: { code: string }; assigned: number }>(
        "/api/companies",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            code: (codeEdit[g.key] ?? "").trim() || undefined,
            locationNames,
          }),
        }
      )
      if (!r.ok) throw new Error(r.error ?? "会社の作成に失敗しました")
      flash(
        `「${name}」（${r.data?.company.code}）を作成し、${r.data?.assigned}店舗を紐づけました`
      )
      setOpenKey(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  /** 既存の会社に紐づける */
  const assignExisting = async (g: SuggestionGroup, override?: string[]) => {
    const companyId = parseInt(existingPick[g.key] ?? "", 10)
    const locationNames = override ?? [...(picked[g.key] ?? [])]
    if (!companyId) {
      setError("紐づけ先の会社を選んでください")
      return
    }
    if (locationNames.length === 0) {
      setError("紐づける店舗を1つ以上選んでください")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const r = await fetchJsonRetry<{ updated: number }>("/api/companies/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, locationNames }),
      })
      if (!r.ok) throw new Error(r.error ?? "紐づけに失敗しました")
      flash(`${r.data?.updated}店舗を紐づけました`)
      setOpenKey(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const openCompany = async (id: number) => {
    if (openCompanyId === id) {
      setOpenCompanyId(null)
      return
    }
    setOpenCompanyId(id)
    setCompanyStores([])
    const r = await fetchJsonRetry<{ stores: CompanyStore[] }>(`/api/companies/${id}`)
    if (r.ok) setCompanyStores(r.data?.stores ?? [])
    else setError(r.error ?? "会社情報の取得に失敗しました")
  }

  /** 会社から店舗の紐づけを外す */
  const unassign = async (locationName: string) => {
    if (!confirm("この店舗の会社の紐づけを解除しますか？（店舗自体は消えません）")) return
    setSaving(true)
    try {
      const r = await fetchJsonRetry("/api/companies/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: null, locationNames: [locationName] }),
      })
      if (!r.ok) throw new Error(r.error ?? "解除に失敗しました")
      flash("紐づけを解除しました")
      if (openCompanyId) await openCompany(openCompanyId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const removeCompany = async (c: CompanyRow) => {
    if (!confirm(`会社「${c.name}」を削除しますか？`)) return
    setSaving(true)
    try {
      const r = await fetchJsonRetry(`/api/companies/${c.id}`, { method: "DELETE" })
      if (!r.ok) throw new Error(r.error ?? "削除に失敗しました")
      flash("削除しました")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const multi = suggestions.filter((g) => g.stores.length > 1)
  const single = suggestions.filter((g) => g.stores.length === 1)

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">会社マスタ</h1>
        <p className="text-sm text-muted-foreground mt-1">
          店舗（営業所・拠点）を会社単位でまとめます。会社IDを持たせることで、
          同名の店舗があっても取り違えず、画像も会社ごとのフォルダで管理できます。
        </p>
      </div>

      <Card className="p-4 bg-blue-50 border-blue-200 flex items-start gap-2">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-900 leading-relaxed">
          <p className="font-bold mb-1">自動では紐づけません</p>
          店舗名から推測した<b>候補</b>を出すところまでが自動です。
          同名で別会社の可能性があるため、内容をご確認のうえボタンで確定してください。
          間違えた場合はいつでも解除できます。
        </div>
      </Card>

      {error && (
        <Card className="p-3 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}
      {success && (
        <Card className="p-3 bg-green-50 border-green-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-800">{success}</p>
        </Card>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Building2 className="h-4 w-4 text-gray-500" />
          登録済みの会社 <b>{companies.length}</b> 社
        </div>
        <div className="text-sm text-amber-700">
          会社が未設定の店舗 <b>{unassignedCount}</b> 件
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          再読み込み
        </Button>
      </div>

      {/* 登録済みの会社 */}
      {companies.length > 0 && (
        <Card className="divide-y">
          {companies.map((c) => (
            <div key={c.id}>
              <div className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <button
                  onClick={() => openCompany(c.id)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left hover:underline"
                >
                  {openCompanyId === c.id ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                    {c.code}
                  </span>
                  <span className="font-medium truncate">{c.name}</span>
                </button>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {c.storeCount} 店舗
                </span>
                <button
                  onClick={() => removeCompany(c)}
                  className="text-gray-400 hover:text-red-500"
                  title="削除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {openCompanyId === c.id && (
                <div className="px-4 pb-3 bg-gray-50">
                  {companyStores.length === 0 ? (
                    <p className="text-xs text-gray-500 py-2">
                      紐づいている店舗はありません。
                    </p>
                  ) : (
                    <div className="border rounded bg-white divide-y">
                      {companyStores.map((s) => (
                        <div
                          key={s.locationName}
                          className="px-3 py-1.5 flex items-center gap-2 text-xs"
                        >
                          <span className="flex-1 min-w-0 truncate">{s.title}</span>
                          <span className="text-gray-400 font-mono">
                            {s.locationName.replace(/^locations\//, "")}
                          </span>
                          <button
                            onClick={() => unassign(s.locationName)}
                            className="text-gray-400 hover:text-red-500"
                            title="紐づけを解除"
                          >
                            <Unlink className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {/* 候補 */}
      <div className="space-y-2">
        <h2 className="text-base font-bold">
          会社の候補（複数店舗がまとまったもの・{multi.length} 件）
        </h2>
        {loading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
            読み込み中…
          </Card>
        ) : multi.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            未紐づけの店舗で、複数店舗にまとまる候補はありません。
          </Card>
        ) : (
          <Card className="divide-y">
            {multi.map((g) => (
              <div key={g.key}>
                <button
                  onClick={() => toggleGroup(g)}
                  className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-left hover:bg-gray-50"
                >
                  {openKey === g.key ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="font-medium flex-1 min-w-0 truncate">{g.companyName}</span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {g.stores.length} 店舗
                  </span>
                </button>

                {openKey === g.key && (
                  <div className="px-4 pb-4 bg-gray-50 space-y-3">
                    <div className="flex gap-3 flex-wrap pt-3">
                      <div className="flex-1 min-w-[240px]">
                        <label className="block text-xs font-medium mb-1">会社名</label>
                        <input
                          type="text"
                          value={nameEdit[g.key] ?? g.companyName}
                          onChange={(e) =>
                            setNameEdit((n) => ({ ...n, [g.key]: e.target.value }))
                          }
                          className="w-full h-9 px-3 text-sm border rounded bg-white"
                        />
                      </div>
                      <div className="w-40">
                        <label className="block text-xs font-medium mb-1">
                          会社コード
                        </label>
                        <input
                          type="text"
                          value={codeEdit[g.key] ?? ""}
                          onChange={(e) =>
                            setCodeEdit((c) => ({ ...c, [g.key]: e.target.value }))
                          }
                          placeholder="空欄なら自動"
                          className="w-full h-9 px-3 text-sm border rounded bg-white font-mono"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      社内で使っている会社コードがあれば入力してください。空欄の場合は
                      C001 形式で自動採番します。
                    </p>

                    <div>
                      <p className="text-xs font-medium mb-1.5">
                        紐づける店舗（チェックを外した店舗は紐づけません）
                      </p>
                      <div className="border rounded bg-white divide-y max-h-64 overflow-y-auto">
                        {g.stores.map((s) => (
                          <label
                            key={s.locationName}
                            className="px-3 py-1.5 flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50"
                          >
                            <input
                              type="checkbox"
                              checked={picked[g.key]?.has(s.locationName) ?? false}
                              onChange={() => toggleStore(g.key, s.locationName)}
                            />
                            <span className="flex-1 min-w-0 truncate">{s.title}</span>
                            <span className="text-gray-400 font-mono">
                              {s.locationName.replace(/^locations\//, "")}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <select
                          value={existingPick[g.key] ?? ""}
                          onChange={(e) =>
                            setExistingPick((p) => ({ ...p, [g.key]: e.target.value }))
                          }
                          className="h-9 px-2 text-sm border rounded bg-white"
                        >
                          <option value="">既存の会社に紐づける…</option>
                          {companies.map((c) => (
                            <option key={c.id} value={String(c.id)}>
                              {c.code} {c.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => assignExisting(g)}
                          disabled={saving || !existingPick[g.key]}
                        >
                          <Link2 className="h-3.5 w-3.5" /> 紐づける
                        </Button>
                      </div>
                      <Button onClick={() => createAndAssign(g)} disabled={saving}>
                        {saving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> 処理中…
                          </>
                        ) : (
                          <>この会社を作成して紐づける（{picked[g.key]?.size ?? 0}店舗）</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* 1店舗だけの候補 */}
      {single.length > 0 && (
        <details className="border rounded">
          <summary className="px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50">
            1店舗だけの候補（{single.length} 件）— 支店が無い会社はこちらから登録します
          </summary>
          <div className="divide-y border-t max-h-96 overflow-y-auto">
            {single.map((g) => (
              <div key={g.key} className="px-4 py-2 flex items-center gap-3 text-xs">
                <span className="flex-1 min-w-0 truncate">{g.stores[0].title}</span>
                <select
                  value={existingPick[g.key] ?? ""}
                  onChange={(e) =>
                    setExistingPick((p) => ({ ...p, [g.key]: e.target.value }))
                  }
                  className="h-8 px-2 border rounded bg-white"
                >
                  <option value="">会社を選択…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.code} {c.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving || !existingPick[g.key]}
                  onClick={() => assignExisting(g, [g.stores[0].locationName])}
                >
                  紐づける
                </Button>
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => createAndAssign(g, [g.stores[0].locationName])}
                >
                  新規作成
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
