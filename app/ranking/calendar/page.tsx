"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">カレンダー順位レポート</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">カレンダー形式で日別の順位を確認できます。</p>
        </CardContent>
      </Card>
    </div>
  )
}
