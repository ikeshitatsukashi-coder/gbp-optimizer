"use client"

import { Card, CardContent } from "@/components/ui/card"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend,
} from "recharts"
import { rankingChartData, rankingKeywords } from "@/lib/mock-data"

export default function RankingChartPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">順位チャート</h1>

      {/* Summary Table */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-4">キーワード順位サマリー</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">キーワード</th>
                  <th className="text-center py-2 px-3">現在順位</th>
                  <th className="text-center py-2 px-3">前回順位</th>
                  <th className="text-center py-2 px-3">最高順位</th>
                  <th className="text-center py-2 px-3">平均順位</th>
                </tr>
              </thead>
              <tbody>
                {rankingKeywords.map((kw) => (
                  <tr key={kw.keyword} className="border-b">
                    <td className="py-2 px-3 font-medium">{kw.keyword}</td>
                    <td className="text-center py-2 px-3">
                      {kw.currentRank ? `${kw.currentRank}位` : "圏外"}
                    </td>
                    <td className="text-center py-2 px-3">
                      {kw.previousRank ? `${kw.previousRank}位` : "圏外"}
                    </td>
                    <td className="text-center py-2 px-3">
                      {kw.bestRank ? `${kw.bestRank}位` : "-"}
                    </td>
                    <td className="text-center py-2 px-3">{kw.avgRank}位</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardContent className="p-5">
          <h3 className="font-bold text-base mb-4">順位推移チャート</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rankingChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={13} />
                <YAxis reversed domain={[1, 50]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}位`} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="keyword1" name="青山 MEO" stroke="#1e3a5f" strokeWidth={2} connectNulls={false} dot={false} />
                <Line type="monotone" dataKey="keyword2" name="港区 Webマーケティング" stroke="#3b82f6" strokeWidth={2} connectNulls={false} dot={false} />
                <Line type="monotone" dataKey="keyword3" name="南青山 Web制作" stroke="#f59e0b" strokeWidth={2} connectNulls={false} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
