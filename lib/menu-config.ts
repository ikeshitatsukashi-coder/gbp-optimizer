import type { MenuGroup } from "@/types"

/**
 * 実データで動作するページのみメニューに掲載。
 * 未実装/プレースホルダーは非表示にして、社内利用時に「動かない」体験を防ぐ。
 */
export const menuConfig: MenuGroup[] = [
  {
    label: "ダッシュボード",
    icon: "LayoutDashboard",
    href: "/",
  },
  {
    label: "店舗マスタ",
    icon: "Building2",
    children: [
      { label: "店舗一覧", href: "/stores" },
      { label: "業種一括マッピング", href: "/stores/industry-mapping" },
    ],
  },
  {
    label: "MEO対策",
    icon: "MapPin",
    children: [{ label: "GBP最適化診断", href: "/meo/diagnosis" }],
  },
  {
    label: "Googleインサイト",
    icon: "BarChart3",
    children: [
      { label: "インサイト情報", href: "/google-data/insights" },
      { label: "データダウンロード", href: "/google-data/insights/download" },
    ],
  },
  {
    label: "Googleビジネスプロフィール",
    icon: "Store",
    children: [
      { label: "店舗基本情報", href: "/google-data/gbp/basic-info" },
      { label: "写真管理", href: "/google-data/gbp/photos" },
      { label: "投稿", href: "/google-data/gbp/posts" },
      { label: "クチコミ管理", href: "/google-data/gbp/reviews" },
      { label: "低評価クチコミ削除申請", href: "/google-data/gbp/review-flag" },
      { label: "削除申請履歴", href: "/google-data/gbp/flag-history" },
      { label: "削除済みクチコミ", href: "/google-data/gbp/deleted-reviews" },
      { label: "除外レビュー管理", href: "/google-data/gbp/exclusions" },
      { label: "クチコミ分析", href: "/google-data/gbp/review-analysis" },
      { label: "クチコミ評価要約", href: "/google-data/gbp/review-summary" },
      { label: "クチコミハイライト分析", href: "/google-data/gbp/review-highlights" },
      { label: "FAQ管理", href: "/google-data/gbp/faq" },
    ],
  },
  {
    label: "自動返信バッチ",
    icon: "Bot",
    href: "/auto-reply",
  },
  {
    label: "投稿スケジューラ",
    icon: "Calendar",
    href: "/scheduled-posts",
  },
]
