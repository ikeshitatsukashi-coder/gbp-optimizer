"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">メモ</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">店舗運用に関するメモを管理できます。</p>
        </CardContent>
      </Card>
    </div>
  )
}
