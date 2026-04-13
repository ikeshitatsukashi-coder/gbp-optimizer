"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">都道府県別インサイト比較</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">都道府県ごとのインサイトデータを比較できます。</p>
        </CardContent>
      </Card>
    </div>
  )
}
