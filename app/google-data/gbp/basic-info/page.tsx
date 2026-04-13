"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { storeBasicInfo } from "@/lib/mock-data"

export default function BasicInfoPage() {
  const [activeTab, setActiveTab] = useState<"basic" | "attributes" | "service">("basic")
  const info = storeBasicInfo

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">店舗基本情報</h1>
          <span className="text-xs text-muted-foreground bg-gray-100 px-2 py-1 rounded">メモ</span>
        </div>
        <span className="text-sm text-muted-foreground">最終更新日: 2026/01/20</span>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        GBPやYahoo!マップに掲載する店舗情報を更新いただけます。
      </p>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: "basic" as const, label: "基本情報" },
          { key: "attributes" as const, label: "属性" },
          { key: "service" as const, label: "サービス" },
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

      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm">更新媒体</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked readOnly className="accent-blue-600" />
          <span className="text-sm">Google</span>
        </label>
        <div className="ml-auto flex gap-2">
          <button className="text-xs border px-3 py-1.5 rounded hover:bg-gray-50">ビジネス情報の変更履歴</button>
          <button className="text-xs border px-3 py-1.5 rounded hover:bg-gray-50">改ざん防止ログ</button>
          <button className="text-xs border px-3 py-1.5 rounded hover:bg-gray-50">ダウンロード</button>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800 mb-6">
        ⚠ 1日1回 MEO Dashboard 基本情報からGBPへの変更処理を行いたくない場合は、項目名に設定されているOFF/ONボタンを「OFF」に設定してください。
      </div>

      {activeTab === "basic" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: NAP Info */}
          <div>
            <h2 className="font-bold text-base mb-4">店舗情報（NAP情報）</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  店舗名 <span className="text-red-500 text-xs">必須</span>
                </label>
                <input type="text" defaultValue={info.name} className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-2">
                  ビジネス名 <span className="text-red-500 text-xs">必須</span>
                  <span className="text-blue-500">G</span>
                  <span className="ml-auto">
                    <ToggleSwitch defaultOn />
                  </span>
                </label>
                <input type="text" defaultValue={info.businessName} className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  店舗コード <span className="text-blue-500">G</span>
                </label>
                <input type="text" defaultValue={info.storeCode} className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  郵便番号 <span className="text-blue-500">G</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="text" defaultValue={info.zipCode} className="flex-1 border rounded px-3 py-2 text-sm mt-1" />
                  <ToggleSwitch defaultOn={false} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  都道府県 <span className="text-blue-500">G</span>
                </label>
                <input type="text" defaultValue={info.prefecture} className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">市区町村</label>
                <input type="text" defaultValue={info.city} className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">住所1</label>
                <input type="text" defaultValue={info.address1} className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">住所2</label>
                <input type="text" defaultValue={info.address2} className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  サービス提供エリア <span className="text-blue-500">G</span>
                </label>
                <div className="flex items-center gap-2 mt-1">
                  {info.serviceArea.map((area) => (
                    <span key={area} className="bg-gray-100 px-2 py-1 rounded text-sm flex items-center gap-1">
                      x {area}
                    </span>
                  ))}
                  <input type="text" placeholder="例: 東京、お台場" className="flex-1 border rounded px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  WEBサイト URL <span className="text-blue-500">G</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="text" defaultValue={info.websiteUrl} className="flex-1 border rounded px-3 py-2 text-sm mt-1" />
                  <ToggleSwitch defaultOn={false} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  SNSプロフィール <span className="text-blue-500">G</span>
                </label>
                <div className="space-y-2 mt-2">
                  {info.snsProfiles.map((sns, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select defaultValue={sns.platform} className="border rounded px-2 py-1.5 text-sm w-32">
                        <option>Instagram</option>
                        <option>X (Twitter)</option>
                        <option>Youtube</option>
                        <option>Linkedin</option>
                        <option>Facebook</option>
                        <option>TikTok</option>
                      </select>
                      <input type="text" defaultValue={sns.url} className="flex-1 border rounded px-3 py-1.5 text-sm" />
                      <button className="text-gray-400 hover:text-red-500">x</button>
                    </div>
                  ))}
                  <button className="text-sm text-blue-500 hover:underline">+ 追加項目</button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  電話番号1 <span className="text-blue-500">G</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="text" defaultValue={info.phone1} className="flex-1 border rounded px-3 py-2 text-sm mt-1" />
                  <ToggleSwitch defaultOn={false} />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Business Hours */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base flex items-center gap-1">
                営業時間 <span className="text-blue-500">G</span>
              </h2>
              <div className="flex items-center gap-2 text-sm">
                <span>改ざん防止</span>
                <ToggleSwitch defaultOn />
              </div>
            </div>
            <div className="space-y-3">
              {info.businessHours.map((day) => (
                <div key={day.day} className="flex items-center gap-3">
                  <span className="w-16 text-sm font-medium">{day.day}</span>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="radio" checked={day.isHoliday} readOnly />
                    定休日
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="radio" checked={!day.isHoliday} readOnly />
                    営業
                  </label>
                  {!day.isHoliday && (
                    <>
                      <label className="flex items-center gap-1 text-sm">
                        <input type="checkbox" checked={day.is24h} readOnly />
                        24時間営業
                      </label>
                      {day.hours.map((h, i) => (
                        <div key={i} className="flex items-center gap-1 text-sm">
                          <input type="text" defaultValue={h.open} className="w-16 border rounded px-2 py-1 text-center" />
                          <span>〜</span>
                          <input type="text" defaultValue={h.close} className="w-16 border rounded px-2 py-1 text-center" />
                          <button className="text-gray-400 hover:text-red-500">x</button>
                        </div>
                      ))}
                      <button className="text-xs text-blue-500">+ 追加</button>
                    </>
                  )}
                </div>
              ))}
            </div>

            <hr className="my-6" />

            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base flex items-center gap-1">
                特別営業時間 <span className="text-blue-500">G</span>
              </h2>
              <div className="flex items-center gap-2 text-sm">
                <span>改ざん防止</span>
                <ToggleSwitch defaultOn={false} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              ※定休日を設定する場合は、日付を選択し、スライダーを青で設定してください。
            </p>
            <div className="space-y-2">
              {info.specialHours.map((sh) => (
                <div key={sh.date} className="flex items-center gap-3 text-sm">
                  <input type="text" defaultValue={sh.date} className="w-28 border rounded px-2 py-1" />
                  <ToggleSwitch defaultOn={sh.isOn} />
                  <input type="text" className="w-16 border rounded px-2 py-1" placeholder="" />
                  <input type="text" className="w-16 border rounded px-2 py-1" placeholder="" />
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={sh.is24h} readOnly />
                    24時間営業
                  </label>
                  <button className="text-gray-400 hover:text-red-500">x</button>
                </div>
              ))}
              <div className="flex gap-2">
                <button className="text-xs text-blue-500">+ 追加</button>
                <button className="text-xs text-blue-500">一括追加</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "attributes" && (
        <Card>
          <CardContent className="p-6">
            <h2 className="font-bold text-base mb-4">属性情報</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">メインカテゴリ</label>
                <input type="text" defaultValue={info.categories.main} className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">サブカテゴリ</label>
                <div className="space-y-2 mt-1">
                  {info.categories.sub.map((cat, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="text" defaultValue={cat} className="flex-1 border rounded px-3 py-2 text-sm" />
                      <button className="text-gray-400 hover:text-red-500 text-sm">x</button>
                    </div>
                  ))}
                  <button className="text-sm text-blue-500">+ 追加</button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">ビジネスの説明</label>
                <textarea
                  defaultValue={info.description}
                  className="w-full border rounded px-3 py-2 text-sm mt-1 h-24"
                />
              </div>
              <div>
                <label className="text-sm font-medium">開業日</label>
                <input type="text" defaultValue={info.openingDate} className="w-full border rounded px-3 py-2 text-sm mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "service" && (
        <Card>
          <CardContent className="p-6">
            <h2 className="font-bold text-base mb-4">サービス情報</h2>
            <p className="text-sm text-muted-foreground">提供サービスの管理画面です。サービスの追加・編集ができます。</p>
            <div className="mt-4 space-y-3">
              {["MEO対策", "SEO対策", "Web制作", "SNS運用代行", "リスティング広告"].map((service) => (
                <div key={service} className="flex items-center justify-between border rounded px-4 py-3">
                  <span className="text-sm">{service}</span>
                  <div className="flex items-center gap-2">
                    <button className="text-xs text-blue-500 hover:underline">編集</button>
                    <button className="text-xs text-red-500 hover:underline">削除</button>
                  </div>
                </div>
              ))}
              <button className="text-sm text-blue-500 hover:underline">+ サービスを追加</button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <button className="bg-[#2c3e50] text-white px-8 py-2.5 rounded text-sm hover:bg-[#34495e]">
          保存する
        </button>
      </div>
    </div>
  )
}

function ToggleSwitch({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <button
      onClick={() => setOn(!on)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        on ? "bg-blue-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          on ? "translate-x-6" : "translate-x-1"
        }`}
      />
      <span className="sr-only">{on ? "ON" : "OFF"}</span>
    </button>
  )
}
