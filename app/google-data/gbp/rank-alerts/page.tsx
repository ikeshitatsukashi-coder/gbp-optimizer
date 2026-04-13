"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">順位変動アラート</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">順位が大幅に変動した際にアラートを受け取れます。</p>
        </CardContent>
      </Card>
    </div>
  )
}
