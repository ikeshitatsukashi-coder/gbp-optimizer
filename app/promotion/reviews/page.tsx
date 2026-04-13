"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">クチコミ促進</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">QRコードやSMS経由でクチコミ投稿を促すツールです。</p>
        </CardContent>
      </Card>
    </div>
  )
}
