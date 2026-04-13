"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">クチコミハイライト分析</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">クチコミの中から注目すべきポイントをハイライト表示します。</p>
        </CardContent>
      </Card>
    </div>
  )
}
