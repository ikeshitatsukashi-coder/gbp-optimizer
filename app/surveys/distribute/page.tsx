"use client"

import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { normalizeSearchText } from "@/lib/search-normalize"
import { googleReviewUrl, locationIdOf } from "@/lib/review-link"
import { Loader2, Printer, Search, AlertCircle } from "lucide-react"

/* -------------------------------------------------------------------------- */
/*  アンケート配布 — QRコード付きポスター（A4/B5）・名刺のPDF出力              */
/*  ブラウザの印刷ダイアログから「PDFとして保存」で出力する                     */
/* -------------------------------------------------------------------------- */

interface StoreRow {
  locationName: string
  title: string
  primaryPhone: string | null
  placeId: string | null
  newReviewUri: string | null
}
interface SurveyOption {
  id: number
  token: string
  name: string
}

/** デザインパレット */
const POSTER_DESIGNS = {
  friendly: { label: "親しみあるデザイン", main: "#e8833a", sub: "#fdf1e7", dark: "#7c3f12" },
  calm: { label: "落ち着いたデザイン", main: "#4f6f5d", sub: "#eef3f0", dark: "#28382f" },
  medical: { label: "医療系デザイン", main: "#4a90c2", sub: "#eaf3fa", dark: "#1d4a6b" },
  business: { label: "ビジネス系デザイン", main: "#1d3a5f", sub: "#eef1f5", dark: "#0e1e33" },
} as const
type PosterDesignKey = keyof typeof POSTER_DESIGNS

const CARD_COLORS = ["#e8833a", "#e35d6a", "#4a90e2", "#41a381", "#6b7280"]

const BODY_SIMPLE =
  "本日はご利用いただきありがとうございました！\nよろしければアンケートにご回答お願いいたします。"
const BODY_DETAILED =
  "本日はご利用いただき誠にありがとうございました。\nお客様の声をより良いサービスづくりに活かすため、\nアンケートを実施しております。\n1分ほどで完了しますので、ぜひご協力をお願いいたします。"

export default function DistributePage() {
  const [tab, setTab] = useState<"poster" | "card">("poster")

  // 共通設定
  const [stores, setStores] = useState<StoreRow[]>([])
  const [surveys, setSurveys] = useState<SurveyOption[]>([])
  const [storeMode, setStoreMode] = useState<"all" | "select">("select")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [storeSearch, setStoreSearch] = useState("")
  const [qrTarget, setQrTarget] = useState<"survey" | "google">("survey")
  const [surveyId, setSurveyId] = useState<number | null>(null)

  // ポスター設定
  const [design, setDesign] = useState<PosterDesignKey>("business")
  const [size, setSize] = useState<"A4" | "B5">("A4")
  const [textType, setTextType] = useState<"simple" | "detailed">("simple")
  const [subtitle, setSubtitle] = useState("アンケート ご協力のお願い")
  const [body, setBody] = useState("")
  const [telFallback, setTelFallback] = useState("")

  // 名刺設定
  const [cardColor, setCardColor] = useState(CARD_COLORS[0])
  const [cardTitle, setCardTitle] = useState("アンケートご協力のお願い")
  const [cardBody, setCardBody] = useState(
    "ご来店いただきありがとうございます。QRコードからアンケートにご協力ください。"
  )

  const [qrMap, setQrMap] = useState<Map<string, string>>(new Map())
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/stores?status=active&limit=2000")
      .then((r) => r.json())
      .then((j) =>
        setStores(
          (j.stores ?? []).map((s: StoreRow) => ({
            locationName: s.locationName,
            title: s.title,
            primaryPhone: s.primaryPhone,
            placeId: s.placeId,
            newReviewUri: s.newReviewUri,
          }))
        )
      )
      .catch(() => {})
    fetch("/api/surveys")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.surveys ?? [])
          .filter((s: { status: string }) => s.status === "active")
          .map((s: { id: number; token: string; name: string }) => ({
            id: s.id,
            token: s.token,
            name: s.name,
          }))
        setSurveys(list)
        if (list.length > 0) setSurveyId(list[0].id)
      })
      .catch(() => {})
  }, [])

  const targetStores = useMemo(
    () =>
      storeMode === "all"
        ? stores
        : stores.filter((s) => selected.has(s.locationName)),
    [storeMode, stores, selected]
  )

  const qrUrlFor = (store: StoreRow): string | null => {
    if (qrTarget === "google") return googleReviewUrl(store)
    const survey = surveys.find((s) => s.id === surveyId)
    if (!survey) return null
    return `${window.location.origin}/s/${survey.token}?store=${locationIdOf(store.locationName)}`
  }

  /** 対象店舗全部のQRを生成してから印刷ダイアログを開く */
  const printAll = async () => {
    setError(null)
    if (targetStores.length === 0) {
      setError("店舗を選択してください")
      return
    }
    if (qrTarget === "survey" && !surveyId) {
      setError("対象アンケートを選択してください（まず「アンケート一覧」から作成）")
      return
    }
    setPreparing(true)
    try {
      const map = new Map<string, string>()
      for (const store of targetStores) {
        const url = qrUrlFor(store)
        if (!url) continue
        map.set(store.locationName, await QRCode.toDataURL(url, { width: 400, margin: 1 }))
      }
      setQrMap(map)
      // DOM反映を待ってから印刷
      setTimeout(() => {
        window.print()
        setPreparing(false)
      }, 500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPreparing(false)
    }
  }

  // プレビュー用: 先頭店舗のQR（未選択時は見本店舗でプレビュー表示）
  const PLACEHOLDER_STORE: StoreRow = {
    locationName: "__placeholder__",
    title: "こちらに各店舗名が記載されます",
    primaryPhone: "こちらに各電話番号が記載されます",
    placeId: null,
    newReviewUri: null,
  }
  const [previewQr, setPreviewQr] = useState<string | null>(null)
  const selectedPreviewStore = targetStores[0] ?? null
  const previewStore = selectedPreviewStore ?? PLACEHOLDER_STORE
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!previewStore) {
        setPreviewQr(null)
        return
      }
      const url = qrUrlFor(previewStore)
      if (!url) {
        setPreviewQr(null)
        return
      }
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1 })
      if (!cancelled) setPreviewQr(dataUrl)
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewStore?.locationName, qrTarget, surveyId, surveys.length])

  const filteredStores = storeSearch
    ? stores.filter((s) =>
        normalizeSearchText(s.title).includes(normalizeSearchText(storeSearch))
      )
    : stores

  const bodyText = body.trim() || (textType === "simple" ? BODY_SIMPLE : BODY_DETAILED)
  const palette = POSTER_DESIGNS[design]

  /* ------------------------------ ポスター1枚 ------------------------------ */
  const Poster = ({ store, qr }: { store: StoreRow; qr: string | null }) => (
    <div
      className="poster-page relative overflow-hidden bg-white"
      style={{
        width: size === "A4" ? "210mm" : "182mm",
        height: size === "A4" ? "296mm" : "256mm",
        backgroundColor: palette.sub,
      }}
    >
      {/* ヘッダーブロック */}
      <div
        className="relative"
        style={{
          backgroundColor: palette.main,
          borderRadius: "0 0 50% 50% / 0 0 18% 18%",
          padding: "14mm 16mm 22mm",
          color: "white",
        }}
      >
        <p style={{ fontSize: "5mm", marginBottom: "10mm" }}>{store.title}</p>
        <p style={{ fontSize: "5.5mm", marginBottom: "4mm" }}>ご利用者のみなさま</p>
        <p style={{ fontSize: "13mm", fontWeight: 800, lineHeight: 1.25, marginBottom: "8mm" }}>
          {subtitle || "アンケート ご協力のお願い"}
        </p>
        <p style={{ fontSize: "4.5mm", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{bodyText}</p>
      </div>

      {/* QRブロック */}
      <div style={{ padding: "16mm", display: "flex", gap: "10mm", alignItems: "center" }}>
        <div>
          <div
            style={{
              backgroundColor: palette.main,
              color: "white",
              display: "inline-block",
              padding: "2mm 6mm",
              borderRadius: "4mm",
              fontSize: "4.5mm",
              fontWeight: 700,
              marginBottom: "4mm",
            }}
          >
            アンケート回答先
          </div>
          <div
            style={{
              backgroundColor: "white",
              padding: "4mm",
              border: `0.8mm solid ${palette.main}`,
              borderRadius: "2mm",
              width: "58mm",
              height: "58mm",
            }}
          >
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR" style={{ width: "100%", height: "100%" }} />
            ) : (
              <div className="w-full h-full bg-gray-100" />
            )}
          </div>
        </div>
        <div
          style={{
            backgroundColor: palette.dark,
            color: "white",
            borderRadius: "50%",
            width: "70mm",
            height: "70mm",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10mm",
            fontSize: "4.2mm",
            lineHeight: 1.9,
          }}
        >
          <span>
            スマートフォン及び携帯電話にて二次元バーコードを読み取り、
            {qrTarget === "survey" ? "アンケートURL" : "クチコミ投稿ページ"}
            にアクセスしてください。
          </span>
        </div>
      </div>

      {/* フッター */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: palette.dark,
          color: "white",
          padding: "5mm 16mm",
          fontSize: "4mm",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>お問い合わせ　{store.title}</span>
        <span>☎ {store.primaryPhone || telFallback || ""}</span>
      </div>
    </div>
  )

  /* ------------------------------ 名刺（10面付け） ------------------------------ */
  const CardSheet = ({ store, qr }: { store: StoreRow; qr: string | null }) => (
    <div
      className="poster-page bg-white"
      style={{
        width: "210mm",
        height: "296mm",
        padding: "14mm",
        display: "grid",
        gridTemplateColumns: "91mm 91mm",
        gridAutoRows: "55mm",
        gap: "0",
        justifyContent: "center",
        alignContent: "start",
      }}
    >
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: "91mm",
            height: "55mm",
            border: "0.2mm dashed #bbb",
            position: "relative",
            overflow: "hidden",
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: "-14mm",
              top: "-14mm",
              width: "42mm",
              height: "84mm",
              backgroundColor: cardColor,
              transform: "rotate(18deg)",
            }}
          />
          <div style={{ position: "relative", padding: "5mm", width: "62mm" }}>
            <p style={{ fontSize: "4.2mm", fontWeight: 800, marginBottom: "2.5mm" }}>
              {cardTitle}
            </p>
            <p style={{ fontSize: "2.8mm", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {cardBody}
            </p>
            <p style={{ fontSize: "2.6mm", marginTop: "2.5mm", color: "#555" }}>{store.title}</p>
          </div>
          <div
            style={{
              position: "absolute",
              right: "3.5mm",
              bottom: "3.5mm",
              width: "20mm",
              height: "20mm",
              backgroundColor: "white",
              padding: "1mm",
              borderRadius: "1mm",
            }}
          >
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR" style={{ width: "100%", height: "100%" }} />
            ) : (
              <div className="w-full h-full bg-gray-100" />
            )}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <style>{`
        .print-area { display: none; }
        @media print {
          @page { size: ${tab === "card" || size === "A4" ? "A4" : "B5"}; margin: 0; }
          aside, header, .no-print { display: none !important; }
          html, body { height: auto !important; overflow: visible !important; display: block !important; background: white !important; }
          body > div, main { overflow: visible !important; height: auto !important; display: block !important; }
          main { padding: 0 !important; }
          .print-area { display: block; margin: 0 !important; }
          .poster-page { page-break-after: always; break-inside: avoid; }
        }
      `}</style>

      <div className="no-print">
        <h1 className="text-2xl font-bold">アンケート配布</h1>
        <p className="text-sm text-muted-foreground mt-1">
          店舗に掲示するQRコード付きポスター・名刺サイズカードを出力します。「PDF出力」を押すと印刷ダイアログが開くので「PDFとして保存」を選んでください。
        </p>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 flex items-start gap-2 no-print">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      <div className="flex gap-6 no-print flex-wrap">
        {/* 設定 */}
        <Card className="p-5 space-y-5 flex-1 min-w-96">
          {/* タブ */}
          <div className="flex border-b">
            <button
              onClick={() => setTab("poster")}
              className={`px-5 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === "poster"
                  ? "border-[#4a90e2] text-[#4a90e2]"
                  : "border-transparent text-gray-500"
              }`}
            >
              パンフレット形式
            </button>
            <button
              onClick={() => setTab("card")}
              className={`px-5 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === "card"
                  ? "border-[#4a90e2] text-[#4a90e2]"
                  : "border-transparent text-gray-500"
              }`}
            >
              名刺形式
            </button>
          </div>

          {/* 店舗選択 */}
          <div>
            <p className="text-sm font-bold mb-2">店舗を選択</p>
            <div className="flex gap-6 mb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={storeMode === "all"}
                  onChange={() => setStoreMode("all")}
                />
                全店舗（{stores.length}件）
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={storeMode === "select"}
                  onChange={() => setStoreMode("select")}
                />
                店舗を選択
              </label>
            </div>
            {storeMode === "select" && (
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
                  選択中: {selected.size} 店舗（1店舗ごとに1ページ出力されます）
                </p>
                <div className="max-h-44 overflow-y-auto space-y-1">
                  {filteredStores.map((s) => (
                    <label
                      key={s.locationName}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(s.locationName)}
                        onChange={(e) => {
                          setSelected((prev) => {
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

          {/* QRの中身 */}
          <div>
            <p className="text-sm font-bold mb-2">二次元バーコード</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={qrTarget === "survey"}
                  onChange={() => setQrTarget("survey")}
                />
                アンケート画面
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={qrTarget === "google"}
                  onChange={() => setQrTarget("google")}
                />
                Googleクチコミ画面
              </label>
            </div>
            {qrTarget === "survey" && (
              <div className="mt-2">
                <label className="block text-xs text-muted-foreground mb-1">
                  対象アンケート名
                </label>
                <select
                  value={surveyId ?? ""}
                  onChange={(e) => setSurveyId(Number(e.target.value))}
                  className="h-9 px-2 text-sm border rounded min-w-64"
                >
                  {surveys.length === 0 && <option value="">公開中のアンケートがありません</option>}
                  {surveys.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {tab === "poster" ? (
            <>
              <div>
                <p className="text-sm font-bold mb-2">デザイン選択</p>
                <div className="flex gap-4 flex-wrap">
                  {(Object.keys(POSTER_DESIGNS) as PosterDesignKey[]).map((k) => (
                    <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        checked={design === k}
                        onChange={() => setDesign(k)}
                      />
                      <span
                        className="w-3 h-3 rounded-full inline-block"
                        style={{ backgroundColor: POSTER_DESIGNS[k].main }}
                      />
                      {POSTER_DESIGNS[k].label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-bold mb-2">サイズを選択</p>
                <div className="flex gap-6">
                  {(["A4", "B5"] as const).map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" checked={size === s} onChange={() => setSize(s)} />
                      {s}サイズ
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-bold mb-2">アンケートのご案内文タイプ</p>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={textType === "simple"}
                      onChange={() => setTextType("simple")}
                    />
                    簡潔タイプ（短めのご案内）
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={textType === "detailed"}
                      onChange={() => setTextType("detailed")}
                    />
                    しっかり説明タイプ（文章多め）
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">
                  サブタイトル（最大文字数：全角16文字）
                </label>
                <input
                  type="text"
                  value={subtitle}
                  maxLength={16}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full h-10 px-3 text-sm border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">
                  本文（全角100文字以内、4行以内。空欄なら案内文タイプの定型文）
                </label>
                <textarea
                  value={body}
                  maxLength={100}
                  rows={4}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={textType === "simple" ? BODY_SIMPLE : BODY_DETAILED}
                  className="w-full px-3 py-2 text-sm border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">
                  お問い合わせTEL（店舗に電話番号が未登録の場合に使用）
                </label>
                <input
                  type="text"
                  value={telFallback}
                  onChange={(e) => setTelFallback(e.target.value)}
                  className="w-full h-10 px-3 text-sm border rounded max-w-60"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-bold mb-2">カラーを選択</p>
                <div className="flex gap-3">
                  {CARD_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCardColor(c)}
                      className={`w-8 h-8 rounded-full border-2 ${
                        cardColor === c ? "border-gray-800" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">タイトル名</label>
                <input
                  type="text"
                  value={cardTitle}
                  maxLength={20}
                  onChange={(e) => setCardTitle(e.target.value)}
                  className="w-full h-10 px-3 text-sm border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">
                  本文（70文字推奨、最大104文字）
                </label>
                <textarea
                  value={cardBody}
                  maxLength={104}
                  rows={3}
                  onChange={(e) => setCardBody(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  名刺サイズ（91×55mm）を1店舗につきA4に10面付けで出力します。
                </p>
              </div>
            </>
          )}

          <div className="pt-2">
            <Button onClick={printAll} disabled={preparing} className="min-w-44">
              {preparing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> QR生成中…
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" /> PDF出力（{targetStores.length}店舗分）
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* プレビュー */}
        <div className="w-[380px] shrink-0">
          <p className="text-xs text-muted-foreground mb-2">
            プレビュー
            {selectedPreviewStore
              ? `（${selectedPreviewStore.title}）`
              : "（見本 — 出力時は各店舗の名前・電話番号・QRが入ります）"}
          </p>
          <div className="border rounded-lg bg-gray-100 p-3 overflow-hidden">
            <div
              style={{
                transform: "scale(0.42)",
                transformOrigin: "top left",
                width: tab === "poster" ? (size === "A4" ? "210mm" : "182mm") : "210mm",
                height: "0",
                paddingBottom: tab === "poster" ? (size === "A4" ? "125mm" : "108mm") : "125mm",
              }}
            >
              {tab === "poster" ? (
                <Poster store={previewStore} qr={previewQr} />
              ) : (
                <CardSheet store={previewStore} qr={previewQr} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 印刷領域（全対象店舗分） */}
      <div className="print-area">
        {targetStores.map((store) =>
          tab === "poster" ? (
            <Poster
              key={store.locationName}
              store={store}
              qr={qrMap.get(store.locationName) ?? null}
            />
          ) : (
            <CardSheet
              key={store.locationName}
              store={store}
              qr={qrMap.get(store.locationName) ?? null}
            />
          )
        )}
      </div>
    </div>
  )
}
