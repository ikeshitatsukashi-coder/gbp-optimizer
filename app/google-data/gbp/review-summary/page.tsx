"use client"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">クチコミ評価要約</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">クチコミの評価をAIが自動で要約します。</p>
        </CardContent>
      </Card>
    </div>
  )
}
