"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Save, ExternalLink, Info } from "lucide-react"
import { useGbp } from "@/lib/store"

interface Address {
  regionCode?: string
  languageCode?: string
  postalCode?: string
  administrativeArea?: string
  locality?: string
  sublocality?: string
  addressLines?: string[]
}

interface HourPeriod {
  openDay?: string
  openTime?: { hours?: number; minutes?: number }
  closeDay?: string
  closeTime?: { hours?: number; minutes?: number }
}

interface Location {
  name?: string
  title?: string
  storefrontAddress?: Address
  phoneNumbers?: {
    primaryPhone?: string
    additionalPhones?: string[]
  }
  websiteUri?: string
  regularHours?: {
    periods?: HourPeriod[]
  }
  categories?: {
    primaryCategory?: {
      name?: string
      displayName?: string
    }
    additionalCategories?: {
      name?: string
      displayName?: string
    }[]
  }
  profile?: {
    description?: string
  }
  openInfo?: {
    openingDate?: { year?: number; month?: number; day?: number }
    status?: string
  }
  serviceArea?: {
    businessType?: string
    places?: {
      placeInfos?: { placeName?: string; placeId?: string }[]
    }
  }
}

const WEEKDAY_LABELS: Record<string, string> = {
  MONDAY: "月",
  TUESDAY: "火",
  WEDNESDAY: "水",
  THURSDAY: "木",
  FRIDAY: "金",
  SATURDAY: "土",
  SUNDAY: "日",
}

function formatTime(t?: { hours?: number; minutes?: number }): string {
  if (!t) return ""
  const h = String(t.hours ?? 0).padStart(2, "0")
  const m = String(t.minutes ?? 0).padStart(2, "0")
  return `${h}:${m}`
}

function parseTime(s: string): { hours: number; minutes: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const hours = parseInt(m[1], 10)
  const minutes = parseInt(m[2], 10)
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}

function formatAddress(a?: Address): string {
  if (!a) return ""
  return [a.administrativeArea, a.locality, a.sublocality, ...(a.addressLines ?? [])]
    .filter(Boolean)
    .join(" ")
}

export default function BasicInfoPage() {
  const { locationName } = useGbp()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"basic" | "attributes">("basic")
  const [original, setOriginal] = useState<Location | null>(null)

  // 編集可能フィールド
  const [title, setTitle] = useState("")
  const [primaryPhone, setPrimaryPhone] = useState("")
  const [websiteUri, setWebsiteUri] = useState("")
  const [postalCode, setPostalCode] = useState("")
  const [administrativeArea, setAdministrativeArea] = useState("")
  const [locality, setLocality] = useState("")
  const [sublocality, setSublocality] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [description, setDescription] = useState("")
  const [hours, setHours] = useState<HourPeriod[]>([])

  const fetchLocation = useCallback(async () => {
    if (!locationName) {
      setOriginal(null)
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(
        `/api/gbp/locations?locationName=${encodeURIComponent(locationName)}`
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      const loc = (j.location ?? {}) as Location
      setOriginal(loc)

      setTitle(loc.title ?? "")
      setPrimaryPhone(loc.phoneNumbers?.primaryPhone ?? "")
      setWebsiteUri(loc.websiteUri ?? "")
      setPostalCode(loc.storefrontAddress?.postalCode ?? "")
      setAdministrativeArea(loc.storefrontAddress?.administrativeArea ?? "")
      setLocality(loc.storefrontAddress?.locality ?? "")
      setSublocality(loc.storefrontAddress?.sublocality ?? "")
      const lines = loc.storefrontAddress?.addressLines ?? []
      setAddressLine1(lines[0] ?? "")
      setAddressLine2(lines[1] ?? "")
      setDescription(loc.profile?.description ?? "")
      setHours(loc.regularHours?.periods ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setOriginal(null)
    } finally {
      setLoading(false)
    }
  }, [locationName])

  useEffect(() => {
    fetchLocation()
  }, [fetchLocation])

  const handleSave = async () => {
    if (!locationName) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    // 変更フィールドを判定して updateMask を組み立てる
    const updateFields: string[] = []
    const data: Record<string, unknown> = {}

    if (title !== (original?.title ?? "")) {
      updateFields.push("title")
      data.title = title
    }
    if (primaryPhone !== (original?.phoneNumbers?.primaryPhone ?? "")) {
      updateFields.push("phoneNumbers")
      data.phoneNumbers = { primaryPhone }
    }
    if (websiteUri !== (original?.websiteUri ?? "")) {
      updateFields.push("websiteUri")
      data.websiteUri = websiteUri
    }
    if (description !== (original?.profile?.description ?? "")) {
      updateFields.push("profile.description")
      data.profile = { description }
    }
    // 住所まとめて
    const origAddr = original?.storefrontAddress ?? {}
    const origLines = origAddr.addressLines ?? []
    const newLines = [addressLine1, addressLine2].filter((l) => l.trim() !== "")
    if (
      postalCode !== (origAddr.postalCode ?? "") ||
      administrativeArea !== (origAddr.administrativeArea ?? "") ||
      locality !== (origAddr.locality ?? "") ||
      sublocality !== (origAddr.sublocality ?? "") ||
      JSON.stringify(newLines) !== JSON.stringify(origLines)
    ) {
      updateFields.push("storefrontAddress")
      data.storefrontAddress = {
        regionCode: origAddr.regionCode ?? "JP",
        languageCode: origAddr.languageCode ?? "ja",
        postalCode,
        administrativeArea,
        locality,
        sublocality,
        addressLines: newLines,
      }
    }
    // 営業時間
    if (JSON.stringify(hours) !== JSON.stringify(original?.regularHours?.periods ?? [])) {
      updateFields.push("regularHours")
      data.regularHours = { periods: hours }
    }

    if (updateFields.length === 0) {
      setSuccess("変更箇所がありません")
      setSaving(false)
      return
    }

    try {
      const res = await fetch("/api/gbp/locations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationName,
          updateMask: updateFields.join(","),
          data,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setSuccess(`保存しました（更新: ${updateFields.join(", ")}）`)
      await fetchLocation()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // 営業時間グループ化（曜日ごと）
  const hoursByDay = WEEKDAY_LABELS
  const updatePeriod = (i: number, patch: Partial<HourPeriod>) => {
    setHours((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], ...patch }
      return next
    })
  }
  const removePeriod = (i: number) => {
    setHours((prev) => prev.filter((_, idx) => idx !== i))
  }
  const addPeriod = (day: string) => {
    setHours((prev) => [
      ...prev,
      {
        openDay: day,
        closeDay: day,
        openTime: { hours: 9, minutes: 0 },
        closeTime: { hours: 18, minutes: 0 },
      },
    ])
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">店舗基本情報</h1>
        {original?.name && (
          <a
            href={`https://business.google.com/n/${original.name.replace("locations/", "")}/info`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
          >
            GBP 管理画面で開く <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {!locationName && (
        <Card className="mb-4 p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800 flex items-center gap-2">
            <Info className="h-4 w-4" /> 画面上部の店舗セレクタで店舗を選択してください。
          </p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" /> 取得中…
        </div>
      )}

      {error && (
        <Card className="mb-4 p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-800">エラー: {error}</p>
        </Card>
      )}

      {success && (
        <Card className="mb-4 p-4 bg-green-50 border-green-200">
          <p className="text-sm text-green-800">{success}</p>
        </Card>
      )}

      {locationName && original && (
        <>
          <div className="flex gap-2 mb-4">
            {[
              { key: "basic" as const, label: "基本情報" },
              { key: "attributes" as const, label: "属性" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm rounded border ${
                  activeTab === tab.key
                    ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "basic" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* NAP */}
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h2 className="font-bold text-base">店舗情報（NAP情報）</h2>

                  <div>
                    <label className="text-sm font-medium">
                      店舗名 <span className="text-red-500 text-xs">必須</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">郵便番号</label>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">都道府県</label>
                    <input
                      type="text"
                      value={administrativeArea}
                      onChange={(e) => setAdministrativeArea(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">市区町村</label>
                    <input
                      type="text"
                      value={locality}
                      onChange={(e) => setLocality(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">町名・字</label>
                    <input
                      type="text"
                      value={sublocality}
                      onChange={(e) => setSublocality(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">住所1</label>
                    <input
                      type="text"
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">住所2(建物名等)</label>
                    <input
                      type="text"
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">電話番号</label>
                    <input
                      type="text"
                      value={primaryPhone}
                      onChange={(e) => setPrimaryPhone(e.target.value)}
                      placeholder="例: 03-1234-5678"
                      className="w-full border rounded px-3 py-2 text-sm mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">WEBサイト URL</label>
                    <input
                      type="url"
                      value={websiteUri}
                      onChange={(e) => setWebsiteUri(e.target.value)}
                      placeholder="https://..."
                      className="w-full border rounded px-3 py-2 text-sm mt-1"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Hours */}
              <Card>
                <CardContent className="p-6">
                  <h2 className="font-bold text-base mb-4">営業時間</h2>
                  <div className="space-y-3">
                    {Object.entries(hoursByDay).map(([dayKey, label]) => {
                      const dayPeriods = hours
                        .map((p, idx) => ({ p, idx }))
                        .filter((x) => x.p.openDay === dayKey)
                      return (
                        <div key={dayKey} className="flex items-start gap-2 flex-wrap">
                          <span className="w-10 text-sm font-medium pt-1.5">{label}</span>
                          {dayPeriods.length === 0 ? (
                            <span className="text-xs text-muted-foreground pt-1.5">定休日</span>
                          ) : (
                            dayPeriods.map(({ p, idx }) => (
                              <div key={idx} className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={formatTime(p.openTime)}
                                  onChange={(e) => {
                                    const t = parseTime(e.target.value)
                                    if (t)
                                      updatePeriod(idx, { openTime: t })
                                  }}
                                  className="w-16 text-sm border rounded px-2 py-1 text-center"
                                />
                                <span className="text-sm">〜</span>
                                <input
                                  type="text"
                                  value={formatTime(p.closeTime)}
                                  onChange={(e) => {
                                    const t = parseTime(e.target.value)
                                    if (t)
                                      updatePeriod(idx, {
                                        closeTime: t,
                                        closeDay: p.closeDay ?? dayKey,
                                      })
                                  }}
                                  className="w-16 text-sm border rounded px-2 py-1 text-center"
                                />
                                <button
                                  onClick={() => removePeriod(idx)}
                                  className="text-gray-400 hover:text-red-500 text-sm"
                                  title="削除"
                                >
                                  ×
                                </button>
                              </div>
                            ))
                          )}
                          <button
                            onClick={() => addPeriod(dayKey)}
                            className="text-xs text-blue-500 hover:underline pt-1.5"
                          >
                            + 追加
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "attributes" && (
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="font-bold text-base">属性情報</h2>

                <div>
                  <label className="text-sm font-medium">メインカテゴリ</label>
                  <input
                    type="text"
                    value={original.categories?.primaryCategory?.displayName ?? ""}
                    disabled
                    className="w-full border rounded px-3 py-2 text-sm mt-1 bg-gray-50"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    カテゴリは categoryId 指定が必要なため、ここでは表示のみ。変更は GBP 管理画面で行ってください。
                  </p>
                </div>

                {(original.categories?.additionalCategories ?? []).length > 0 && (
                  <div>
                    <label className="text-sm font-medium">追加カテゴリ</label>
                    <div className="space-y-1 mt-1">
                      {original.categories!.additionalCategories!.map((c, i) => (
                        <input
                          key={i}
                          type="text"
                          value={c.displayName ?? ""}
                          disabled
                          className="w-full border rounded px-3 py-2 text-sm bg-gray-50"
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium">ビジネスの説明</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={6}
                    maxLength={750}
                    className="w-full border rounded px-3 py-2 text-sm mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {description.length} / 750 文字
                  </p>
                </div>

                {original.openInfo?.openingDate && (
                  <div>
                    <label className="text-sm font-medium">開業日</label>
                    <input
                      type="text"
                      value={
                        `${original.openInfo.openingDate.year ?? ""}-${original.openInfo.openingDate.month ?? ""}-${original.openInfo.openingDate.day ?? ""}`
                      }
                      disabled
                      className="w-full border rounded px-3 py-2 text-sm mt-1 bg-gray-50"
                    />
                  </div>
                )}

                {original.serviceArea?.places?.placeInfos &&
                  original.serviceArea.places.placeInfos.length > 0 && (
                    <div>
                      <label className="text-sm font-medium">サービス提供エリア</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {original.serviceArea.places.placeInfos.map((p, i) => (
                          <span
                            key={i}
                            className="bg-gray-100 px-2 py-1 rounded text-sm"
                          >
                            {p.placeName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={fetchLocation} disabled={saving || loading}>
              リセット
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  保存中…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  保存する
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            ※ Google Business Profile API v1 経由で店舗情報を更新します。住所表記の正規化や反映タイミングは Google 側に依存します。
          </p>
        </>
      )}

      {!loading && locationName && !original && !error && (
        <div className="text-sm text-muted-foreground text-center py-8">
          店舗情報を取得できませんでした
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-6">
        メインカテゴリ・住所などフィールドによっては GBP の認証が必要です。
      </p>
    </div>
  )
}
