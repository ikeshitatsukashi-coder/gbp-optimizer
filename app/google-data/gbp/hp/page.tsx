"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">HP連携</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">自社HPとGoogleビジネスプロフィールの連携設定を管理します。</p>
        </CardContent>
      </Card>
    </div>
  )
}
