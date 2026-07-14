"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { normalizeSearchText } from "@/lib/search-normalize"
import { Loader2, Plus, X, AlertCircle, Search } from "lucide-react"

interface Choice {
  label: string
  redirect: "google" | "tool"
}
interface Question {
  title: string
  type: "single" | "multiple"
  choices: Choice[]
}
interface StoreOption {
  locationName: string
  title: string
}

const DEFAULT_QUESTION: Question = {
  title: "",
  type: "single",
  choices: [
    { label: "非常に満足", redirect: "google" },
    { label: "満足", redirect: "google" },
    { label: "どちらでもない", redirect: "tool" },
    { label: "不満", redirect: "tool" },
    { label: "非常に不満", redirect: "tool" },
  ],
}

function SurveyBuilder() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [urlMode, setUrlMode] = useState<"group" | "per_store">("group")
  const [storeSelectMode, setStoreSelectMode] = useState<"pulldown" | "buttons">("pulldown")
  const [targetMode, setTargetMode] = useState<"all" | "select">("all")
  const [targetStores, setTargetStores] = useState<Set<string>>(new Set())
  const [questions, setQuestions] = useState<Question[]>([
    { ...DEFAULT_QUESTION, title: "当店のご利用満足度はいかがでしたか？" },
  ])
  const [collectRespondent, setCollectRespondent] = useState(false)

  const [stores, setStores] = useState<StoreOption[]>([])
  const [storeSearch, setStoreSearch] = useState("")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!editId)
  const [error, setError] = useState<string | null>(null)

  // 店舗リスト
  useEffect(() => {
    fetch("/api/stores?status=active&limit=2000")
      .then((r) => r.json())
      .then((j) =>
        setStores(
          (j.stores ?? []).map((s: { locationName: string; title: string }) => ({
            locationName: s.locationName,
            title: s.title,
          }))
        )
      )
      .catch(() => {})
  }, [])

  // 編集時: 既存データ読み込み
  const loadExisting = useCallback(async () => {
    if (!editId) return
    try {
      const res = await fetch("/api/surveys")
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      const target = (j.surveys ?? []).find(
        (s: { id: number }) => String(s.id) === editId
      )
      if (!target) throw new Error("アンケートが見つかりません")
      if (target.responseCount > 0) {
        throw new Error("回答があるため編集できません。一覧から複製してください。")
      }
      setName(target.name)
      setDescription(target.description ?? "")
      setUrlMode(target.urlMode)
      setStoreSelectMode(target.storeSelectMode)
      if (target.targetStores?.length) {
        setTargetMode("select")
        setTargetStores(new Set(target.targetStores))
      }
      setQuestions(target.questions)
      setCollectRespondent(target.collectRespondent)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [editId])

  useEffect(() => {
    loadExisting()
  }, [loadExisting])

  const updateQuestion = (qi: number, patch: Partial<Question>) => {
    setQuestions((prev) => prev.map((q, i) => (i === qi ? { ...q, ...patch } : q)))
  }
  const updateChoice = (qi: number, ci: number, patch: Partial<Choice>) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qi
          ? { ...q, choices: q.choices.map((c, j) => (j === ci ? { ...c, ...patch } : c)) }
          : q
      )
    )
  }

  const filteredStores = storeSearch
    ? stores.filter((s) =>
        normalizeSearchText(s.title).includes(normalizeSearchText(storeSearch))
      )
    : stores

  const save = async () => {
    setError(null)
    if (!name.trim()) {
      setError("アンケート名を入力してください")
      return
    }
    for (const q of questions) {
      if (!q.title.trim()) {
        setError("質問タイトルが未入力の質問があります")
        return
      }
      if (q.choices.filter((c) => c.label.trim()).length < 2) {
        setError(`「${q.title}」の選択肢は2つ以上必要です`)
        return
      }
    }
    setSaving(true)
    try {
      const payload = {
        name,
        description,
        urlMode,
        storeSelectMode,
        targetStores: targetMode === "select" ? [...targetStores] : null,
        questions: questions.map((q) => ({
          ...q,
          title: q.title.trim(),
          choices: q.choices
            .filter((c) => c.label.trim())
            .map((c) => ({ label: c.label.trim(), redirect: c.redirect })),
        })),
        collectRespondent,
      }
      const res = await fetch(editId ? `/api/surveys?id=${editId}` : "/api/surveys", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      router.push("/surveys")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">
          {editId ? "アンケート編集" : "アンケート新規作成"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          アンケートに一度でも回答が付くと、内容の編集ができなくなります。
          二次元バーコードやURLを配布して回答してもらえるアンケートを登録・編集できます。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {/* 基本情報 */}
      <Card className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-bold mb-1">アンケート名（必須）</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 本日の説明会アンケート"
            className="w-full h-10 px-3 text-sm border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-bold mb-1">アンケート概要</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="回答画面の説明文として表示されます"
            className="w-full h-10 px-3 text-sm border rounded"
          />
        </div>
      </Card>

      {/* URL発行方法 */}
      <Card className="p-5 space-y-4">
        <div>
          <p className="text-sm font-bold mb-2">アンケートURL発行方法</p>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={urlMode === "group"}
                onChange={() => setUrlMode("group")}
              />
              グループ共通URL発行（回答画面で店舗を選択）
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={urlMode === "per_store"}
                onChange={() => setUrlMode("per_store")}
              />
              店舗ごとのURL発行
            </label>
          </div>
        </div>
        {urlMode === "group" && (
          <div>
            <p className="text-sm font-bold mb-2">店舗名選択方法</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={storeSelectMode === "pulldown"}
                  onChange={() => setStoreSelectMode("pulldown")}
                />
                店舗名プルダウン選択
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={storeSelectMode === "buttons"}
                  onChange={() => setStoreSelectMode("buttons")}
                />
                店舗一覧選択（店舗名ボタン選択）
              </label>
            </div>
          </div>
        )}
        <div>
          <p className="text-sm font-bold mb-2">アンケート対象店舗</p>
          <div className="flex gap-6 mb-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={targetMode === "all"}
                onChange={() => setTargetMode("all")}
              />
              グループ全店舗
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={targetMode === "select"}
                onChange={() => setTargetMode("select")}
              />
              対象店舗を選択
            </label>
          </div>
          {targetMode === "select" && (
            <div className="border rounded p-3">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                  placeholder="店舗名で検索（あいまい検索対応）"
                  className="w-full h-9 pl-8 pr-3 text-sm border rounded"
                />
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                選択中: {targetStores.size} 店舗
              </p>
              <div className="max-h-52 overflow-y-auto space-y-1">
                {filteredStores.map((s) => (
                  <label
                    key={s.locationName}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={targetStores.has(s.locationName)}
                      onChange={(e) => {
                        setTargetStores((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(s.locationName)
                          else next.delete(s.locationName)
                          return next
                        })
                      }}
                    />
                    {s.title}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 質問 */}
      {questions.map((q, qi) => (
        <Card key={qi} className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">質問 {qi + 1}</p>
            {questions.length > 1 && (
              <button
                onClick={() =>
                  setQuestions((prev) => prev.filter((_, i) => i !== qi))
                }
                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
              >
                <X className="h-3 w-3" /> この質問を削除
              </button>
            )}
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={q.type === "single"}
                onChange={() => updateQuestion(qi, { type: "single" })}
              />
              選択形式（単一選択）
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={q.type === "multiple"}
                onChange={() => updateQuestion(qi, { type: "multiple" })}
              />
              選択形式（複数選択）
            </label>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">
              質問タイトル（全角50文字以内）
            </label>
            <input
              type="text"
              value={q.title}
              maxLength={50}
              onChange={(e) => updateQuestion(qi, { title: e.target.value })}
              placeholder="例: 本日の会社説明会全体の満足度はいかがでしたか？"
              className="w-full h-10 px-3 text-sm border rounded bg-indigo-50/50"
            />
          </div>
          <div>
            <p className="text-sm font-bold mb-1">選択項目、アンケート後レビュー画面遷移先</p>
            <p className="text-xs text-muted-foreground mb-2">
              ※レビュー画面遷移先は、その回答がどちらの画面（Googleレビュー、ツールのレビュー）に遷移させるのか設定してください。
            </p>
            <div className="space-y-2">
              {q.choices.map((c, ci) => (
                <div key={ci} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={c.label}
                    onChange={(e) => updateChoice(qi, ci, { label: e.target.value })}
                    placeholder={`選択肢 ${ci + 1}`}
                    className="flex-1 h-10 px-3 text-sm border rounded bg-indigo-50/50"
                  />
                  <select
                    value={c.redirect}
                    onChange={(e) =>
                      updateChoice(qi, ci, {
                        redirect: e.target.value as "google" | "tool",
                      })
                    }
                    className="h-10 px-2 text-sm border rounded w-48"
                  >
                    <option value="google">Googleレビューへ遷移</option>
                    <option value="tool">ツールのレビューへ遷移</option>
                  </select>
                  <button
                    onClick={() =>
                      updateQuestion(qi, {
                        choices: q.choices.filter((_, j) => j !== ci),
                      })
                    }
                    disabled={q.choices.length <= 2}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-30 p-1"
                    title="選択肢を削除"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                updateQuestion(qi, {
                  choices: [...q.choices, { label: "", redirect: "google" }],
                })
              }
              className="text-xs text-[#4a90e2] hover:underline mt-2 flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> 選択肢追加
            </button>
          </div>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => setQuestions((prev) => [...prev, { ...DEFAULT_QUESTION }])}
        >
          <Plus className="h-4 w-4" /> 質問追加
        </Button>
      </div>

      {/* オプション */}
      <Card className="p-5 space-y-3">
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={collectRespondent}
            onChange={(e) => setCollectRespondent(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-bold">アンケート回答者付</span>
            <span className="block text-xs text-muted-foreground mt-1">
              チェックをいれると、アンケート内に回答者を特定できるフォーム（氏名や連絡先）が追加されます。
              キャンペーンのお知らせなどにご活用ください。
            </span>
          </span>
        </label>
      </Card>

      <div className="flex justify-center gap-3 pb-8">
        <Button variant="outline" onClick={() => router.push("/surveys")} disabled={saving}>
          キャンセル
        </Button>
        <Button onClick={save} disabled={saving} className="min-w-32">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> 保存中…
            </>
          ) : editId ? (
            "更新する"
          ) : (
            "登録する"
          )}
        </Button>
      </div>
    </div>
  )
}

export default function SurveyBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
        </div>
      }
    >
      <SurveyBuilder />
    </Suspense>
  )
}
