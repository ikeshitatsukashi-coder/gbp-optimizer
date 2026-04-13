"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">キーワード分析</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">登録キーワードごとの順位推移と検索ボリュームを分析します。</p>
        </CardContent>
      </Card>
    </div>
  )
}
