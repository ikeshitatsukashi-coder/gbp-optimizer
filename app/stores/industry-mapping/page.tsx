"use client"

import { useCallback, useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Plus,
  Trash2,
  Eye,
  Play,
  Lightbulb,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"

type Field = "title" | "primaryCategory" | "parentCompany" | "address"

interface MapRule {
  field: Field
  patterns: string[]
  industry: string
  autoReplyEnabled?: boolean
  autoFlagEnabled?: boolean
  parentCompany?: string
  onlyDefault?: boolean
}

interface PreviewMatch {
  ruleIndex: number
  industry: string
  matchedCount: number
  sample: Array<{ locationName: string; title: string; current: string }>
}

interface CategoryStats {
  byIndustry: Array<{ industry: string; count: number }>
  byCategory: Array<{ category: string; count: number }>
  byParentCompany: Array<{ parent: string; count: number }>
}

const FIELD_LABELS: Record<Field, string> = {
  title: "店舗名",
  primaryCategory: "Google カテゴリ",
  parentCompany: "親会社",
  address: "住所",
}

const INDUSTRY_LABELS: Record<string, string> = {
  btob_logistics: "BtoB物流",
  bakery: "ベーカリー",
  funeral: "葬祭",
  restaurant: "飲食",
  construction: "建設・不動産",
  staffing: "人材派遣",
  buyback: "買取・質屋",
  general_btoc: "BtoC一般",
  general_btob: "BtoB一般",
}

const TEMPLATE_RULES: { name: string; rule: MapRule }[] = [
  {
    name: "物流系（運送・倉庫・観光バス）",
    rule: {
      field: "title",
      patterns: ["運送", "物流", "ロジ", "倉庫", "観光バス", "陸送", "通運", "急便"],
      industry: "btob_logistics",
      autoReplyEnabled: true,
    },
  },
  {
    name: "ベーカリー",
    rule: {
      field: "title",
      patterns: ["パン", "ベーカリー", "Bakery"],
      industry: "bakery",
    },
  },
  {
    name: "葬祭",
    rule: {
      field: "title",
      patterns: ["祭典", "葬儀", "斎場", "法宴", "セレモニー"],
      industry: "funeral",
    },
  },
  {
    name: "飲食",
    rule: {
      field: "title",
      patterns: ["カフェ", "Cafe", "レストラン", "居酒屋", "ピッツェリア", "ラーメン", "焼肉", "Bar"],
      industry: "restaurant",
    },
  },
  {
    name: "建設・不動産・建物管理",
    rule: {
      field: "title",
      patterns: ["建設", "建築", "工務店", "不動産", "建物管理", "リフォーム", "土木"],
      industry: "construction",
    },
  },
  {
    name: "人材派遣",
    rule: {
      field: "title",
      patterns: ["派遣", "人材"],
      industry: "staffing",
    },
  },
  {
    name: "買取・質屋・リサイクル",
    rule: {
      field: "title",
      patterns: ["買取", "質屋", "リサイクル"],
      industry: "buyback",
    },
  },
]

function newEmptyRule(): MapRule {
  return {
    field: "title",
    patterns: [""],
    industry: "btob_logistics",
    onlyDefault: true,
  }
}

export default function IndustryMappingPage() {
  const [rules, setRules] = useState<MapRule[]>([newEmptyRule()])
  const [previews, setPreviews] = useState<PreviewMatch[] | null>(null)
  const [stats, setStats] = useState<CategoryStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stores/category-stats")
      const j = await res.json()
      if (res.ok) setStats(j)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const updateRule = (i: number, patch: Partial<MapRule>) => {
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  const removeRule = (i: number) => {
    setRules((prev) => prev.filter((_, idx) => idx !== i))
  }
  const addRule = () => setRules((prev) => [...prev, newEmptyRule()])

  const updatePatterns = (i: number, idx: number, value: string) => {
    setRules((prev) =>
      prev.map((r, ri) => {
        if (ri !== i) return r
        const patterns = [...r.patterns]
        patterns[idx] = value
        return { ...r, patterns }
      })
    )
  }
  const addPattern = (i: number) => {
    setRules((prev) =>
      prev.map((r, ri) => (ri === i ? { ...r, patterns: [...r.patterns, ""] } : r))
    )
  }
  const removePattern = (i: number, idx: number) => {
    setRules((prev) =>
      prev.map((r, ri) =>
        ri === i ? { ...r, patterns: r.patterns.filter((_, pi) => pi !== idx) } : r
      )
    )
  }

  const applyTemplate = (tpl: MapRule) => {
    setRules((prev) => [...prev, { ...tpl, patterns: [...tpl.patterns] }])
  }

  const handlePreview = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const cleanRules = rules.map((r) => ({
        ...r,
        patterns: r.patterns.filter((p) => p.trim() !== ""),
      }))
      const res = await fetch("/api/stores/bulk-industry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", rules: cleanRules }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      setPreviews(j.previews)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPreviews(null)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    if (!previews) {
      setError("先にプレビューを実行してください")
      return
    }
    const total = previews.reduce((s, p) => s + p.matchedCount, 0)
    if (
      !confirm(
        `${total} 件の店舗の業種を更新します。\n後勝ち（複数ルールに該当した場合は後のルールが上書き）。\n続行しますか？`
      )
    )
      return

    setLoading(true)
    setError(null)
    try {
      const cleanRules = rules.map((r) => ({
        ...r,
        patterns: r.patterns.filter((p) => p.trim() !== ""),
      }))
      const res = await fetch("/api/stores/bulk-industry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "apply", rules: cleanRules }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || j.detail || `HTTP ${res.status}`)
      const totalUpdated = j.applied.reduce(
        (s: number, a: { updatedCount: number }) => s + a.updatedCount,
        0
      )
      setSuccess(`${totalUpdated} 店舗を更新しました`)
      setPreviews(null)
      await loadStats()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">業種一括マッピング</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ルールベースで複数店舗の業種を一括設定します。各ルールは「フィールド × キーワード」でマッチさせ、合致した店舗に指定業種を適用します。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {success && (
        <Card className="p-4 bg-green-50 border-green-200 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
          <p className="text-sm text-green-800">{success}</p>
        </Card>
      )}

      {/* 現状サマリー */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4">
            <h2 className="text-sm font-bold mb-2">業種別 店舗数（現状）</h2>
            <div className="space-y-1 text-sm">
              {stats.byIndustry.map((r) => (
                <div key={r.industry} className="flex justify-between">
                  <span>{INDUSTRY_LABELS[r.industry] ?? r.industry}</span>
                  <span className="font-medium">{r.count}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-bold mb-2">Google カテゴリ Top 10</h2>
            <div className="space-y-1 text-xs">
              {stats.byCategory.slice(0, 10).map((r) => (
                <div key={r.category} className="flex justify-between">
                  <span className="truncate">{r.category}</span>
                  <span className="font-medium ml-2">{r.count}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-bold mb-2">親会社 Top 10</h2>
            <div className="space-y-1 text-xs">
              {stats.byParentCompany.length === 0 ? (
                <p className="text-muted-foreground">親会社未設定の店舗のみ</p>
              ) : (
                stats.byParentCompany.slice(0, 10).map((r) => (
                  <div key={r.parent} className="flex justify-between">
                    <span className="truncate">{r.parent}</span>
                    <span className="font-medium ml-2">{r.count}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {/* テンプレート */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-bold">テンプレートから追加</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_RULES.map((t) => (
            <button
              key={t.name}
              onClick={() => applyTemplate(t.rule)}
              className="text-xs px-3 py-1.5 border border-blue-300 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
            >
              + {t.name}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          ※ テンプレートは出発点です。クリック後、キーワードを必要に応じて調整してください。
        </p>
      </Card>

      {/* ルール編集 */}
      <div className="space-y-3">
        {rules.map((rule, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="text-sm font-bold">ルール {i + 1}</div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => removeRule(i)}
                disabled={rules.length === 1}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  マッチ対象フィールド
                </label>
                <select
                  value={rule.field}
                  onChange={(e) =>
                    updateRule(i, { field: e.target.value as Field })
                  }
                  className="w-full h-8 px-2 text-sm border rounded bg-white"
                >
                  {Object.entries(FIELD_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  適用業種
                </label>
                <select
                  value={rule.industry}
                  onChange={(e) => updateRule(i, { industry: e.target.value })}
                  className="w-full h-8 px-2 text-sm border rounded bg-white"
                >
                  {Object.entries(INDUSTRY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground block">追加の設定</label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={rule.onlyDefault ?? false}
                    onChange={(e) =>
                      updateRule(i, { onlyDefault: e.target.checked })
                    }
                    className="h-3.5 w-3.5"
                  />
                  業種が「BtoC一般」のみ対象（既に設定済みは触らない）
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={rule.autoReplyEnabled ?? false}
                    onChange={(e) =>
                      updateRule(i, { autoReplyEnabled: e.target.checked })
                    }
                    className="h-3.5 w-3.5"
                  />
                  同時に「自動返信ON」にする
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={rule.autoFlagEnabled ?? false}
                    onChange={(e) =>
                      updateRule(i, { autoFlagEnabled: e.target.checked })
                    }
                    className="h-3.5 w-3.5"
                  />
                  同時に「自動削除申請ON」にする
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                キーワード（部分一致・大文字小文字区別なし、複数あれば OR 結合）
              </label>
              <div className="space-y-1">
                {rule.patterns.map((p, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={p}
                      onChange={(e) => updatePatterns(i, idx, e.target.value)}
                      placeholder="例: 運送"
                      className="flex-1 h-8 px-2 text-sm border rounded bg-white"
                    />
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => removePattern(i, idx)}
                      disabled={rule.patterns.length === 1}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="xs" onClick={() => addPattern(i)}>
                  <Plus className="h-3 w-3" />
                  キーワード追加
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1 mt-3">
                親会社をまとめて設定（任意）
              </label>
              <input
                type="text"
                value={rule.parentCompany ?? ""}
                onChange={(e) =>
                  updateRule(i, { parentCompany: e.target.value })
                }
                placeholder="例: 丸進運輸株式会社（マッチした店舗全てに同じ親会社を設定）"
                className="w-full h-8 px-2 text-sm border rounded bg-white"
              />
            </div>
          </Card>
        ))}

        <Button variant="outline" onClick={addRule}>
          <Plus className="h-4 w-4" />
          ルールを追加
        </Button>
      </div>

      {/* アクション */}
      <Card className="p-4 sticky bottom-4 bg-white border-2 shadow-lg">
        <div className="flex items-center gap-2">
          <Button onClick={handlePreview} disabled={loading} variant="outline">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            プレビュー（マッチ件数を確認）
          </Button>
          <Button
            onClick={handleApply}
            disabled={!previews || loading}
            variant="destructive"
          >
            <Play className="h-4 w-4" />
            実行（DB を更新）
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          ※ 先にプレビューでマッチ件数を確認してから実行してください。後勝ち（複数ルールに該当した店舗は最後のルールの業種で上書き）。
        </p>
      </Card>

      {/* プレビュー結果 */}
      {previews && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold">プレビュー結果</h2>
          <p className="text-sm text-muted-foreground">
            合計マッチ件数:{" "}
            <span className="font-bold text-base">
              {previews.reduce((s, p) => s + p.matchedCount, 0)}
            </span>
            （重複店舗は後のルールで上書き）
          </p>
          {previews.map((p) => (
            <Card key={p.ruleIndex} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-bold">
                  ルール {p.ruleIndex + 1} → {INDUSTRY_LABELS[p.industry] ?? p.industry}
                </div>
                <span className="text-sm font-medium">{p.matchedCount} 件マッチ</span>
              </div>
              {p.sample.length === 0 ? (
                <p className="text-sm text-muted-foreground">マッチなし</p>
              ) : (
                <div className="space-y-1 text-sm">
                  {p.sample.map((s) => (
                    <div key={s.locationName} className="flex justify-between gap-2 text-xs">
                      <span className="truncate flex-1">{s.title}</span>
                      <span className="text-muted-foreground">
                        {INDUSTRY_LABELS[s.current] ?? s.current} →{" "}
                        <strong>{INDUSTRY_LABELS[p.industry] ?? p.industry}</strong>
                      </span>
                    </div>
                  ))}
                  {p.matchedCount > p.sample.length && (
                    <p className="text-xs text-muted-foreground">
                      ...他 {p.matchedCount - p.sample.length} 件
                    </p>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
