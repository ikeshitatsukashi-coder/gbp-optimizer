"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">飲食店メニュー</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Googleビジネスプロフィールに掲載するメニュー情報を管理できます。</p>
        </CardContent>
      </Card>
    </div>
  )
}
