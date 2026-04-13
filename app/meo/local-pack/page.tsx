"use client"

import { Card, CardContent } from "@/components/ui/card"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend,
} from "recharts"

const localPackData = (() => {
  const data: { date: string; pack3: number | null; pack7: number | null; organic: number | null }[] = []
  const now = new Date(2026, 3, 13)
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const r3 = Math.random()
    const r7 = Math.random()
    data.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      pack3: r3 > 0.6 ? Math.floor(Math.random() * 3) + 1 : null,
      pack7: r7 > 0.3 ? Math.floor(Math.random() * 7) + 1 : null,
      organic: Math.random() > 0.4 ? Math.floor(Math.random() * 20) + 1 : null,
    })
  }
  return data
})()

const gridRankData = [
  { point: "青山一丁目駅", distance: "0.3km", rank: 3 },
  { point: "外苑前駅", distance: "0.5km", rank: 5 },
  { point: "表参道駅", distance: "0.8km", rank: 8 },
  { point: "乃木坂駅", distance: "1.0km", rank: 12 },
  { point: "赤坂見附駅", distance: "1.2km", rank: null },
  { point: "渋谷駅", distance: "2.0km", rank: null },
  { point: "六本木駅", distance: "1.5km", rank: 15 },
  { point: "溜池山王駅", distance: "1.3km", rank: null },
  { point: "新橋駅", distance: "3.0km", rank: null },
]

export default function LocalPackPage() {
  const latestPack3 = localPackData.filter((d) => d.pack3 !== null).length
  const pack3Rate = Math.round((latestPack3 / localPackData.length) * 100)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">ローカルパック順位</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground mb-1">3パック表示率</p>
            <span className="text-3xl font-bold text-blue-600">{pack3Rate}%</span>
            <p className="text-xs text-muted-foreground mt-1">過去30日間</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground mb-1">最新3パック順位</p>
            <span className="text-3xl font-bold">
              {localPackData[localPackData.length - 1].pack3
                ? `${localPackData[localPackData.length - 1].pack3}位`
                : "圏外"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-sm text-muted-foreground mb-1">計測キーワード</p>
            <span className="text-xl font-bold">MEO対策 港区</span>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-4">ローカルパック順位推移</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={localPackData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
                <YAxis reversed domain={[1, 20]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}位`} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="pack3" name="3パック" stroke="#3b82f6" strokeWidth={2} connectNulls={false} />
                <Line type="monotone" dataKey="pack7" name="7パック" stroke="#f59e0b" strokeWidth={2} connectNulls={false} />
                <Line type="monotone" dataKey="organic" name="自然検索" stroke="#10b981" strokeWidth={1.5} connectNulls={false} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Grid Rank */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-4">エリア別ローカル順位（グリッドサーチ）</h3>
          <p className="text-xs text-muted-foreground mb-4">
            店舗周辺の異なる地点からの検索順位を表示しています。
          </p>
          <div className="grid grid-cols-3 gap-3">
            {gridRankData.map((point) => (
              <div
                key={point.point}
                className={`p-3 rounded border text-center ${
                  point.rank !== null && point.rank <= 3
                    ? "bg-green-50 border-green-200"
                    : point.rank !== null && point.rank <= 7
                      ? "bg-yellow-50 border-yellow-200"
                      : point.rank !== null
                        ? "bg-orange-50 border-orange-200"
                        : "bg-gray-50 border-gray-200"
                }`}
              >
                <p className="text-xs font-medium mb-1">{point.point}</p>
                <p className="text-xs text-muted-foreground mb-1">{point.distance}</p>
                <span className={`text-lg font-bold ${
                  point.rank !== null && point.rank <= 3
                    ? "text-green-600"
                    : point.rank !== null && point.rank <= 7
                      ? "text-yellow-600"
                      : point.rank !== null
                        ? "text-orange-600"
                        : "text-gray-400"
                }`}>
                  {point.rank ? `${point.rank}位` : "圏外"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
