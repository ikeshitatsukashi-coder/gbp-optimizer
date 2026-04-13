"use client"

import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, AlertTriangle, XCircle, ExternalLink } from "lucide-react"

const napSources = [
  {
    source: "Googleビジネスプロフィール",
    url: "https://google.com/maps",
    name: "株式会社LIGO",
    address: "東京都港区南青山2-2-15",
    phone: "03-5776-2504",
    nameMatch: true,
    addressMatch: true,
    phoneMatch: true,
  },
  {
    source: "自社ウェブサイト",
    url: "https://www.li-go.jp/",
    name: "株式会社LIGO",
    address: "東京都港区南青山2-2-15",
    phone: "03-5776-2504",
    nameMatch: true,
    addressMatch: true,
    phoneMatch: true,
  },
  {
    source: "食べログ",
    url: "#",
    name: "未登録",
    address: "未登録",
    phone: "未登録",
    nameMatch: false,
    addressMatch: false,
    phoneMatch: false,
  },
  {
    source: "ホットペッパー",
    url: "#",
    name: "未登録",
    address: "未登録",
    phone: "未登録",
    nameMatch: false,
    addressMatch: false,
    phoneMatch: false,
  },
  {
    source: "Yahoo!ロコ",
    url: "#",
    name: "株式会社LIGO",
    address: "東京都港区南青山2-2-15",
    phone: "03-5776-2504",
    nameMatch: true,
    addressMatch: true,
    phoneMatch: true,
  },
  {
    source: "iタウンページ",
    url: "#",
    name: "株式会社LIGO",
    address: "東京都港区南青山2丁目2-15",
    phone: "03-5776-2504",
    nameMatch: true,
    addressMatch: false,
    phoneMatch: true,
  },
  {
    source: "Facebook",
    url: "#",
    name: "LIGO Inc.",
    address: "東京都港区南青山2-2-15",
    phone: "03-5776-2504",
    nameMatch: false,
    addressMatch: true,
    phoneMatch: true,
  },
  {
    source: "Instagram",
    url: "https://instagram.com/ligo.saiyou",
    name: "LIGO（採用アカウント）",
    address: "-",
    phone: "-",
    nameMatch: false,
    addressMatch: false,
    phoneMatch: false,
  },
]

function MatchIcon({ match }: { match: boolean }) {
  return match ? (
    <CheckCircle2 className="h-4 w-4 text-green-500" />
  ) : (
    <XCircle className="h-4 w-4 text-red-500" />
  )
}

export default function NapCheckPage() {
  const reference = napSources[0]
  const totalChecks = napSources.length * 3
  const matchCount = napSources.reduce(
    (sum, s) => sum + (s.nameMatch ? 1 : 0) + (s.addressMatch ? 1 : 0) + (s.phoneMatch ? 1 : 0),
    0
  )
  const consistency = Math.round((matchCount / totalChecks) * 100)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">NAP一貫性チェック</h1>

      {/* Score */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">NAP一貫性スコア</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-bold ${consistency >= 80 ? "text-green-600" : consistency >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                  {consistency}%
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {matchCount}/{totalChecks} の項目が一致しています
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium mb-1">基準情報（GBP）</p>
              <p className="text-xs text-muted-foreground">{reference.name}</p>
              <p className="text-xs text-muted-foreground">{reference.address}</p>
              <p className="text-xs text-muted-foreground">{reference.phone}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800 mb-6">
        NAP（Name, Address, Phone）の一貫性はMEOの重要なランキング要因です。全てのWebサイト・ディレクトリで同じ情報を使用してください。
      </div>

      {/* Detail Table */}
      <Card>
        <CardContent className="p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 px-3">掲載先</th>
                  <th className="text-left py-2 px-3">ビジネス名</th>
                  <th className="text-center py-2 px-3">一致</th>
                  <th className="text-left py-2 px-3">住所</th>
                  <th className="text-center py-2 px-3">一致</th>
                  <th className="text-left py-2 px-3">電話番号</th>
                  <th className="text-center py-2 px-3">一致</th>
                  <th className="text-center py-2 px-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {napSources.map((s) => (
                  <tr key={s.source} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium">
                      <div className="flex items-center gap-1">
                        {s.source}
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-500">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </td>
                    <td className={`py-2 px-3 ${!s.nameMatch ? "text-red-600" : ""}`}>{s.name}</td>
                    <td className="text-center py-2 px-3"><MatchIcon match={s.nameMatch} /></td>
                    <td className={`py-2 px-3 ${!s.addressMatch ? "text-red-600" : ""}`}>{s.address}</td>
                    <td className="text-center py-2 px-3"><MatchIcon match={s.addressMatch} /></td>
                    <td className={`py-2 px-3 ${!s.phoneMatch ? "text-red-600" : ""}`}>{s.phone}</td>
                    <td className="text-center py-2 px-3"><MatchIcon match={s.phoneMatch} /></td>
                    <td className="text-center py-2 px-3">
                      {(!s.nameMatch || !s.addressMatch || !s.phoneMatch) && (
                        <button className="text-xs text-blue-500 hover:underline">修正する</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end gap-2">
        <button className="border px-4 py-2 rounded text-sm hover:bg-gray-50">掲載先を追加</button>
        <button className="bg-[#2c3e50] text-white px-6 py-2 rounded text-sm hover:bg-[#34495e]">再チェック</button>
      </div>
    </div>
  )
}
