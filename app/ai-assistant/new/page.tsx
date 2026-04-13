"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function AiAssistantNewPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">AI運用アシスタント</h1>
      <p className="text-sm text-muted-foreground mb-2">Googleビジネスプロフィール運用状況の審査とアドバイスが受けられます。</p>
      <p className="text-sm text-muted-foreground mb-6">Googleビジネスプロフィール運用は1日1回のご利用となります。次回のご利用は24時間後に可能です。</p>
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">『Googleビジネスプロフィール運用』ボタンをクリックしてください。</p>
          <button className="border-2 border-[#2c3e50] text-[#2c3e50] px-6 py-3 rounded hover:bg-[#2c3e50] hover:text-white transition-colors">
            Googleビジネスプロフィール運用
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
