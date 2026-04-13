"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Plus } from "lucide-react"
import { faqList } from "@/lib/mock-data"

export default function FaqPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">FAQ管理</h1>
        <button className="bg-[#2c3e50] text-white px-4 py-2 rounded text-sm hover:bg-[#34495e] flex items-center gap-1">
          <Plus className="h-4 w-4" /> FAQ追加
        </button>
      </div>
      <div className="space-y-4">
        {faqList.map((faq) => (
          <Card key={faq.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-blue-600 text-sm">Q.</span>
                    <span className="font-medium text-sm">{faq.question}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${faq.isPublished ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {faq.isPublished ? "公開中" : "非公開"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 ml-0">
                    <span className="font-bold text-green-600 text-sm">A.</span>
                    <span className="text-sm text-muted-foreground">{faq.answer}</span>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button className="text-xs text-blue-500 hover:underline">編集</button>
                  <button className="text-xs text-red-500 hover:underline">削除</button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
