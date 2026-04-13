"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">構造化データ作成</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">検索エンジン向けの構造化データを生成します。</p>
        </CardContent>
      </Card>
    </div>
  )
}
