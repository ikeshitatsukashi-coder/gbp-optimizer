"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Star } from "lucide-react"
import { competitorData } from "@/lib/mock-data"

export default function CompetitorsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">競合分析</h1>
      <Card>
        <CardContent className="p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-3">店舗名</th>
                  <th className="text-center py-3 px-3">評価</th>
                  <th className="text-center py-3 px-3">クチコミ数</th>
                  <th className="text-center py-3 px-3">順位</th>
                </tr>
              </thead>
              <tbody>
                {competitorData.map((comp) => (
                  <tr key={comp.name} className={`border-b ${comp.isOwn ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                    <td className="py-3 px-3 font-medium">
                      {comp.name} {comp.isOwn && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-1">自店舗</span>}
                    </td>
                    <td className="text-center py-3 px-3">
                      <span className="flex items-center justify-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {comp.rating}
                      </span>
                    </td>
                    <td className="text-center py-3 px-3">{comp.reviewCount}件</td>
                    <td className="text-center py-3 px-3">{comp.rank ? `${comp.rank}位` : "圏外"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
