"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Upload, Eye, Image } from "lucide-react"
import { photosList } from "@/lib/mock-data"

export default function PhotosPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">写真管理</h1>
        <button className="bg-[#2c3e50] text-white px-4 py-2 rounded text-sm hover:bg-[#34495e] flex items-center gap-1">
          <Upload className="h-4 w-4" /> 写真をアップロード
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {photosList.map((photo) => (
          <Card key={photo.id} className="overflow-hidden">
            <div className="aspect-square bg-gray-200 flex items-center justify-center">
              <Image className="h-12 w-12 text-gray-400" />
            </div>
            <CardContent className="p-3">
              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{photo.category}</span>
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>{photo.uploadDate}</span>
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{photo.views}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
