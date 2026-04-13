"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Eye, MousePointer, Plus } from "lucide-react"
import { postsList } from "@/lib/mock-data"

export default function PostsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">投稿</h1>
        <button className="bg-[#2c3e50] text-white px-4 py-2 rounded text-sm hover:bg-[#34495e] flex items-center gap-1">
          <Plus className="h-4 w-4" /> 新規投稿
        </button>
      </div>
      <div className="space-y-4">
        {postsList.map((post) => (
          <Card key={post.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded mr-2">{post.type}</span>
                  <span className="text-xs text-muted-foreground">{post.date}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{post.views}</span>
                  <span className="flex items-center gap-1"><MousePointer className="h-3 w-3" />{post.clicks}</span>
                </div>
              </div>
              <h3 className="font-medium text-sm mb-1">{post.title}</h3>
              <p className="text-sm text-muted-foreground">{post.content}</p>
              <div className="flex gap-2 mt-3">
                <button className="text-xs text-blue-500 hover:underline">編集</button>
                <button className="text-xs text-red-500 hover:underline">削除</button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
