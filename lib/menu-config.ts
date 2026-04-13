import type { MenuGroup } from "@/types"

export const menuConfig: MenuGroup[] = [
  {
    label: "ダッシュボード",
    icon: "LayoutDashboard",
    href: "/",
  },
  {
    label: "MEO対策",
    icon: "MapPin",
    children: [
      { label: "GBP最適化診断", href: "/meo/diagnosis" },
      { label: "施策チェックリスト", href: "/meo/checklist" },
      { label: "キーワード最適化", href: "/meo/keywords" },
      { label: "NAP一貫性チェック", href: "/meo/nap-check" },
      { label: "サイテーション管理", href: "/meo/citations" },
      { label: "ローカルパック順位", href: "/meo/local-pack" },
      { label: "投稿最適化", href: "/meo/post-optimization" },
      { label: "写真最適化ガイド", href: "/meo/photo-guide" },
    ],
  },
  {
    label: "AI運用アシスタント",
    icon: "Bot",
    children: [
      { label: "新規", href: "/ai-assistant/new" },
      { label: "診断結果一覧", href: "/ai-assistant/history" },
    ],
  },
  {
    label: "Googleデータ連携",
    icon: "BarChart3",
    children: [
      { label: "--- Googleインサイト ---", href: "#" },
      { label: "インサイト情報", href: "/google-data/insights" },
      { label: "業種別インサイト比較", href: "/google-data/insights/industry" },
      { label: "都道府県別インサイト比較", href: "/google-data/insights/prefecture" },
      { label: "インサイトクロス分析", href: "/google-data/insights/cross" },
      { label: "データダウンロード", href: "/google-data/insights/download" },
      { label: "--- Googleビジネスプロフィール ---", href: "#" },
      { label: "店舗基本情報", href: "/google-data/gbp/basic-info" },
      { label: "飲食店メニュー", href: "/google-data/gbp/menu" },
      { label: "HP連携", href: "/google-data/gbp/hp" },
      { label: "写真管理", href: "/google-data/gbp/photos" },
      { label: "投稿", href: "/google-data/gbp/posts" },
      { label: "HP投稿連携", href: "/google-data/gbp/hp-posts" },
      { label: "クチコミ管理", href: "/google-data/gbp/reviews" },
      { label: "クチコミ分析", href: "/google-data/gbp/review-analysis" },
      { label: "クチコミ評価要約", href: "/google-data/gbp/review-summary" },
      { label: "クチコミハイライト分析", href: "/google-data/gbp/review-highlights" },
      { label: "競合分析", href: "/google-data/gbp/competitors" },
      { label: "FAQ管理", href: "/google-data/gbp/faq" },
      { label: "順位変動アラート", href: "/google-data/gbp/rank-alerts" },
      { label: "構造化データ作成", href: "/google-data/gbp/structured-data" },
    ],
  },
  {
    label: "順位レポート",
    icon: "TrendingUp",
    children: [
      { label: "順位チャート", href: "/ranking/chart" },
      { label: "キーワード分析", href: "/ranking/keywords" },
      { label: "多地点順位チェック", href: "/ranking/multi-location" },
      { label: "カレンダー順位レポート", href: "/ranking/calendar" },
      { label: "データダウンロード", href: "/ranking/download" },
    ],
  },
  {
    label: "プロモーションメニュー",
    icon: "Megaphone",
    children: [
      { label: "クチコミ促進", href: "/promotion/reviews" },
      { label: "クーポン管理", href: "/promotion/coupons" },
    ],
  },
  {
    label: "メモ",
    icon: "FileText",
    href: "/memo",
  },
]
