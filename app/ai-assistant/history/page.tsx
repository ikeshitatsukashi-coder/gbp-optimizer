"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function AiAssistantHistoryPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">診断結果一覧</h1>
      <Card>
        <CardContent className="p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">診断日</th>
                  <th className="text-left py-2 px-3">スコア</th>
                  <th className="text-left py-2 px-3">ステータス</th>
                  <th className="text-center py-2 px-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { date: "2026/04/10", score: 72, status: "改善余地あり" },
                  { date: "2026/04/03", score: 68, status: "改善余地あり" },
                  { date: "2026/03/27", score: 65, status: "改善が必要" },
                ].map((item) => (
                  <tr key={item.date} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{item.date}</td>
                    <td className="py-2 px-3">
                      <span className={`font-bold ${item.score >= 70 ? "text-green-600" : item.score >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                        {item.score}/100
                      </span>
                    </td>
                    <td className="py-2 px-3">{item.status}</td>
                    <td className="py-2 px-3 text-center">
                      <button className="text-blue-500 text-xs hover:underline">詳細を見る</button>
                    </td>
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
