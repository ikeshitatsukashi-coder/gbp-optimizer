"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { CheckSquare, Square, Clock, ArrowUpRight } from "lucide-react"

interface CheckItem {
  id: string
  label: string
  description: string
  priority: "high" | "medium" | "low"
  category: string
  link?: string
  completed: boolean
}

const initialChecklist: CheckItem[] = [
  // 初期設定
  { id: "1", label: "Googleビジネスプロフィールのオーナー確認を完了する", description: "オーナー確認が完了していないと多くの機能が制限されます", priority: "high", category: "初期設定", completed: true },
  { id: "2", label: "正確なビジネス名を設定する", description: "正式名称を使用。キーワードの詰め込みはペナルティ対象", priority: "high", category: "初期設定", completed: true },
  { id: "3", label: "適切なメインカテゴリを選択する", description: "最も事業内容を表すカテゴリを選択", priority: "high", category: "初期設定", completed: true },
  { id: "4", label: "サブカテゴリを追加する（最大9個）", description: "関連するカテゴリを追加して露出を増やす", priority: "medium", category: "初期設定", completed: true },
  { id: "5", label: "正確なNAP情報を入力する", description: "名前・住所・電話番号をWeb全体で統一", priority: "high", category: "初期設定", completed: true },
  // コンテンツ最適化
  { id: "6", label: "ビジネスの説明を750文字で記入する", description: "キーワードを自然に含めた魅力的な説明文を作成", priority: "high", category: "コンテンツ最適化", completed: false },
  { id: "7", label: "サービス/商品情報を登録する", description: "提供するサービスや商品を詳細に登録", priority: "medium", category: "コンテンツ最適化", completed: true },
  { id: "8", label: "FAQを5件以上登録する", description: "よくある質問を登録してユーザーの疑問に先回り", priority: "medium", category: "コンテンツ最適化", completed: false },
  { id: "9", label: "属性情報を全て設定する", description: "Wi-Fi、駐車場、バリアフリーなどの属性を設定", priority: "low", category: "コンテンツ最適化", completed: false },
  // 写真・メディア
  { id: "10", label: "ロゴとカバー写真を設定する", description: "高品質なロゴとカバー写真でブランドイメージを確立", priority: "high", category: "写真・メディア", completed: false },
  { id: "11", label: "外観・内装の写真を各3枚以上アップロード", description: "来店前のイメージを具体的に伝える", priority: "high", category: "写真・メディア", completed: false },
  { id: "12", label: "スタッフ・チームの写真をアップロード", description: "人の写真は信頼感を高める効果あり", priority: "medium", category: "写真・メディア", completed: false },
  { id: "13", label: "30秒以内の紹介動画をアップロード", description: "動画は写真よりもエンゲージメントが高い", priority: "low", category: "写真・メディア", completed: false },
  // 継続運用
  { id: "14", label: "週1回以上の投稿を行う", description: "定期的な投稿でアクティブなプロフィールを維持", priority: "high", category: "継続運用", link: "/meo/post-optimization", completed: false },
  { id: "15", label: "クチコミに48時間以内に返信する", description: "迅速な返信はGoogleの評価向上に寄与", priority: "high", category: "継続運用", link: "/google-data/gbp/reviews", completed: false },
  { id: "16", label: "月1回以上の写真追加", description: "新しい写真は検索表示回数の増加に貢献", priority: "medium", category: "継続運用", completed: false },
  { id: "17", label: "特別営業時間を祝日前に更新する", description: "営業時間の不一致はネガティブ体験の原因", priority: "medium", category: "継続運用", completed: false },
  { id: "18", label: "NAP情報の一貫性を月1回チェック", description: "外部サイトでのNAP情報の不一致を防ぐ", priority: "medium", category: "継続運用", link: "/meo/nap-check", completed: false },
  // 外部対策
  { id: "19", label: "主要ディレクトリサイトに登録する", description: "食べログ、ホットペッパー等に正確な情報で登録", priority: "high", category: "外部対策", link: "/meo/citations", completed: false },
  { id: "20", label: "自社サイトにNAP情報を掲載する", description: "構造化データも併せて設定するとさらに効果的", priority: "high", category: "外部対策", completed: false },
  { id: "21", label: "自社サイトにGoogleマップを埋め込む", description: "サイトとGBPの関連付けを強化", priority: "medium", category: "外部対策", completed: false },
  { id: "22", label: "SNSプロフィールにNAP情報を統一して掲載", description: "SNSからのサイテーション効果", priority: "low", category: "外部対策", completed: false },
]

export default function ChecklistPage() {
  const [items, setItems] = useState(initialChecklist)
  const [filterCategory, setFilterCategory] = useState("all")

  const categories = [...new Set(items.map((i) => i.category))]
  const filtered = filterCategory === "all" ? items : items.filter((i) => i.category === filterCategory)
  const completedCount = items.filter((i) => i.completed).length
  const progress = Math.round((completedCount / items.length) * 100)

  const toggleItem = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i)))
  }

  const grouped = filtered.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = []
      acc[item.category].push(item)
      return acc
    },
    {} as Record<string, CheckItem[]>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">MEO施策チェックリスト</h1>

      {/* Progress */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">全体進捗</span>
            <span className="text-sm text-muted-foreground">
              {completedCount} / {items.length} 完了
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-blue-500 rounded-full h-3 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{progress}% 完了</p>
        </CardContent>
      </Card>

      {/* Category Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilterCategory("all")}
          className={`px-3 py-1.5 text-xs rounded border ${
            filterCategory === "all" ? "bg-[#2c3e50] text-white border-[#2c3e50]" : "bg-white border-gray-300"
          }`}
        >
          すべて
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 text-xs rounded border ${
              filterCategory === cat ? "bg-[#2c3e50] text-white border-[#2c3e50]" : "bg-white border-gray-300"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Checklist */}
      <div className="space-y-4">
        {Object.entries(grouped).map(([category, catItems]) => (
          <Card key={category}>
            <CardContent className="p-5">
              <h3 className="font-bold text-base mb-3">{category}</h3>
              <div className="space-y-1">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 py-2 px-2 rounded hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleItem(item.id)}
                  >
                    {item.completed ? (
                      <CheckSquare className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    ) : (
                      <Square className="h-5 w-5 text-gray-300 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${item.completed ? "line-through text-muted-foreground" : "font-medium"}`}>
                          {item.label}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            item.priority === "high"
                              ? "bg-red-100 text-red-700"
                              : item.priority === "medium"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {item.priority === "high" ? "高" : item.priority === "medium" ? "中" : "低"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    {item.link && (
                      <a
                        href={item.link}
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-500 hover:underline text-xs flex items-center gap-0.5 shrink-0"
                      >
                        対応する <ArrowUpRight className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
