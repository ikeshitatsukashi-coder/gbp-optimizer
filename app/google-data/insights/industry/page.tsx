"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">業種別インサイト比較</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">同業種の店舗とインサイトデータを比較できます。</p>
        </CardContent>
      </Card>
    </div>
  )
}
