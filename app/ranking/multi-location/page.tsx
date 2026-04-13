"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">多地点順位チェック</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">異なる地点からの検索順位を確認できます。</p>
        </CardContent>
      </Card>
    </div>
  )
}
