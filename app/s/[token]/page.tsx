"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Loader2, Star, CheckCircle2 } from "lucide-react"

/* -------------------------------------------------------------------------- */
/*  公開アンケート回答ページ（認証なし・スマホ最適化）                          */
/*  回答内容に応じて Googleレビュー投稿 or ツール内レビューに遷移               */
/* -------------------------------------------------------------------------- */

interface PublicSurvey {
  name: string
  description: string | null
  urlMode: string
  storeSelectMode: string
  collectRespondent: boolean
  questions: { title: string; type: "single" | "multiple"; choices: string[] }[]
  stores: { id: string; title: string }[]
}

type Phase = "loading" | "form" | "submitting" | "google" | "tool" | "done" | "error" | "closed"

function SurveyForm() {
  const params = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const fixedStore = searchParams.get("store")

  const [survey, setSurvey] = useState<PublicSurvey | null>(null)
  const [phase, setPhase] = useState<Phase>("loading")
  const [error, setError] = useState<string | null>(null)

  const [storeId, setStoreId] = useState<string>("")
  const [answers, setAnswers] = useState<Map<string, Set<string>>>(new Map())
  const [respName, setRespName] = useState("")
  const [respContact, setRespContact] = useState("")

  const [responseId, setResponseId] = useState<number | null>(null)
  const [googleUrl, setGoogleUrl] = useState<string | null>(null)

  // ツール内レビュー用
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [reviewSending, setReviewSending] = useState(false)

  useEffect(() => {
    if (!params.token) return
    fetch(`/api/public/surveys/${params.token}`)
      .then(async (r) => {
        const j = await r.json()
        if (r.status === 410) {
          setPhase("closed")
          return
        }
        if (!r.ok) throw new Error(j.error || "読み込みに失敗しました")
        setSurvey(j)
        setPhase("form")
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e))
        setPhase("error")
      })
  }, [params.token])

  useEffect(() => {
    if (fixedStore) setStoreId(fixedStore)
  }, [fixedStore])

  // 対象店舗が1つだけのアンケートは自動選択（回答者に店舗選択を見せない）
  useEffect(() => {
    if (!fixedStore && survey && survey.stores.length === 1) {
      setStoreId(survey.stores[0].id)
    }
  }, [survey, fixedStore])

  const toggleAnswer = (qTitle: string, choice: string, type: "single" | "multiple") => {
    setAnswers((prev) => {
      const next = new Map(prev)
      const current = new Set(next.get(qTitle) ?? [])
      if (type === "single") {
        next.set(qTitle, new Set([choice]))
      } else {
        if (current.has(choice)) current.delete(choice)
        else current.add(choice)
        next.set(qTitle, current)
      }
      return next
    })
  }

  const submit = useCallback(async () => {
    if (!survey) return
    setError(null)
    if (!storeId) {
      setError("店舗を選択してください")
      return
    }
    for (const q of survey.questions) {
      if (q.type === "single" && (answers.get(q.title)?.size ?? 0) !== 1) {
        setError(`「${q.title}」に回答してください`)
        window.scrollTo({ top: 0, behavior: "smooth" })
        return
      }
    }
    setPhase("submitting")
    try {
      const res = await fetch(`/api/public/surveys/${params.token}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store: storeId,
          answers: survey.questions.map((q) => ({
            title: q.title,
            selected: [...(answers.get(q.title) ?? [])],
          })),
          respondentName: respName,
          respondentContact: respContact,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "送信に失敗しました")
      setResponseId(j.responseId)
      if (j.redirect === "google" && j.googleReviewUrl) {
        setGoogleUrl(j.googleReviewUrl)
        setPhase("google")
      } else {
        setPhase("tool")
      }
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase("form")
    }
  }, [survey, storeId, answers, respName, respContact, params.token])

  const sendToolReview = async () => {
    setReviewSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/public/surveys/${params.token}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store: storeId,
          responseId,
          rating: rating || undefined,
          comment,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "送信に失敗しました")
      setPhase("done")
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReviewSending(false)
    }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gray-100 py-6 px-4">
      <div className="max-w-lg mx-auto">{children}</div>
    </div>
  )

  if (phase === "loading") {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-20">
          <Loader2 className="h-5 w-5 animate-spin" /> 読み込み中…
        </div>
      </Shell>
    )
  }
  if (phase === "closed") {
    return (
      <Shell>
        <div className="bg-white rounded-xl shadow p-8 text-center text-sm text-gray-600">
          このアンケートは終了しました。
        </div>
      </Shell>
    )
  }
  if (phase === "error" || !survey) {
    return (
      <Shell>
        <div className="bg-white rounded-xl shadow p-8 text-center text-sm text-gray-600">
          {error ?? "アンケートが見つかりません"}
        </div>
      </Shell>
    )
  }

  /* ------------------------- 回答完了 → Google誘導 ------------------------- */
  if (phase === "google") {
    return (
      <Shell>
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-lg font-bold mb-2">ご回答ありがとうございました！</h1>
          <p className="text-sm text-gray-600 mb-6 leading-relaxed">
            よろしければ、Googleのクチコミでも
            <br />
            ご感想をお聞かせください。
          </p>
          <a
            href={googleUrl ?? "#"}
            className="block w-full bg-[#4a90e2] text-white font-bold rounded-lg py-3.5 text-sm hover:opacity-90"
          >
            Googleにクチコミを投稿する
          </a>
          <p className="text-xs text-gray-400 mt-4">
            投稿にはGoogleアカウントが必要です
          </p>
        </div>
      </Shell>
    )
  }

  /* ---------------------- 回答完了 → ツール内レビュー ---------------------- */
  if (phase === "tool") {
    return (
      <Shell>
        <div className="bg-white rounded-xl shadow p-8">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-lg font-bold mb-2 text-center">ご回答ありがとうございました</h1>
          <p className="text-sm text-gray-600 mb-6 text-center leading-relaxed">
            今後のサービス改善のため、
            <br />
            よろしければ詳しくお聞かせください。
          </p>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="flex justify-center gap-2 mb-5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} className="p-1">
                <Star
                  className={`h-9 w-9 ${
                    n <= rating ? "text-amber-400 fill-amber-400" : "text-gray-300"
                  }`}
                />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            placeholder="お気づきの点・ご意見をご自由にお書きください"
            className="w-full border rounded-lg px-3 py-2.5 text-sm mb-4"
          />
          <button
            onClick={sendToolReview}
            disabled={reviewSending || (!rating && !comment.trim())}
            className="block w-full bg-[#4a90e2] text-white font-bold rounded-lg py-3.5 text-sm hover:opacity-90 disabled:opacity-40"
          >
            {reviewSending ? "送信中…" : "送信する"}
          </button>
          <button
            onClick={() => setPhase("done")}
            className="block w-full text-center text-xs text-gray-400 mt-3 hover:text-gray-600"
          >
            スキップして終了
          </button>
        </div>
      </Shell>
    )
  }

  if (phase === "done") {
    return (
      <Shell>
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-lg font-bold">ありがとうございました</h1>
          <p className="text-sm text-gray-600 mt-2">
            いただいたご意見はサービス改善に活用させていただきます。
          </p>
        </div>
      </Shell>
    )
  }

  /* -------------------------------- 回答フォーム -------------------------------- */
  // 店舗が確定している場合（URL指定 or 対象店舗が1つ）は選択欄を出さない
  const showStoreSelector = !fixedStore && survey.stores.length > 1
  const fixedStoreTitle =
    (fixedStore ? survey.stores.find((s) => s.id === fixedStore)?.title : null) ??
    (survey.stores.length === 1 ? survey.stores[0].title : null)

  return (
    <Shell>
      <div className="bg-[#2c5f8a] text-white rounded-t-xl px-6 py-5">
        <h1 className="text-lg font-bold">{survey.name}</h1>
        {survey.description && (
          <p className="text-xs mt-1.5 opacity-90 leading-relaxed">{survey.description}</p>
        )}
        {fixedStoreTitle && <p className="text-xs mt-2 opacity-90">対象店舗: {fixedStoreTitle}</p>}
      </div>
      <div className="bg-white rounded-b-xl shadow divide-y">
        {error && (
          <div className="px-6 py-3 bg-red-50 text-sm text-red-700">{error}</div>
        )}

        {showStoreSelector && (
          <div className="px-6 py-5">
            <p className="text-sm font-bold mb-3">
              ご利用店舗 <span className="text-red-500 text-xs">必須</span>
            </p>
            {survey.storeSelectMode === "buttons" && survey.stores.length <= 60 ? (
              <div className="flex flex-wrap gap-2">
                {survey.stores.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStoreId(s.id)}
                    className={`text-xs px-3 py-2 rounded-full border ${
                      storeId === s.id
                        ? "bg-[#4a90e2] text-white border-[#4a90e2]"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            ) : (
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full h-11 px-3 text-sm border rounded-lg"
              >
                <option value="">選択してください</option>
                {survey.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {survey.questions.map((q, qi) => (
          <div key={qi} className="px-6 py-5">
            <p className="text-sm font-bold mb-3">
              Q{qi + 1}. {q.title}{" "}
              {q.type === "single" ? (
                <span className="text-red-500 text-xs">必須</span>
              ) : (
                <span className="text-gray-400 text-xs">（複数選択可）</span>
              )}
            </p>
            <div className="space-y-2">
              {q.choices.map((c, ci) => {
                const checked = answers.get(q.title)?.has(c) ?? false
                return (
                  <label
                    key={ci}
                    className={`flex items-center gap-3 border rounded-lg px-4 py-3 text-sm cursor-pointer ${
                      checked ? "border-[#4a90e2] bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type={q.type === "single" ? "radio" : "checkbox"}
                      name={`q-${qi}`}
                      checked={checked}
                      onChange={() => toggleAnswer(q.title, c, q.type)}
                    />
                    {c}
                  </label>
                )
              })}
            </div>
          </div>
        ))}

        {survey.collectRespondent && (
          <div className="px-6 py-5 space-y-3">
            <p className="text-sm font-bold">
              お客様情報 <span className="text-gray-400 text-xs">（任意）</span>
            </p>
            <input
              type="text"
              value={respName}
              onChange={(e) => setRespName(e.target.value)}
              placeholder="お名前"
              className="w-full h-11 px-3 text-sm border rounded-lg"
            />
            <input
              type="text"
              value={respContact}
              onChange={(e) => setRespContact(e.target.value)}
              placeholder="メールアドレスまたは電話番号"
              className="w-full h-11 px-3 text-sm border rounded-lg"
            />
          </div>
        )}

        <div className="px-6 py-5">
          <button
            onClick={submit}
            disabled={phase === "submitting"}
            className="block w-full bg-[#4a90e2] text-white font-bold rounded-lg py-3.5 text-sm hover:opacity-90 disabled:opacity-50"
          >
            {phase === "submitting" ? "送信中…" : "回答を送信する"}
          </button>
        </div>
      </div>
    </Shell>
  )
}

export default function PublicSurveyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      }
    >
      <SurveyForm />
    </Suspense>
  )
}
