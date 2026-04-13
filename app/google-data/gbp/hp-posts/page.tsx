"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">HP投稿連携</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">HPの更新情報を自動的にGBPに投稿する連携設定です。</p>
        </CardContent>
      </Card>
    </div>
  )
}
