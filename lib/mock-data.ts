import type { KpiData, ActionData, RankData, ReviewSummary } from "@/types"

function generateDailyData(days: number, min: number, max: number) {
  const data: { date: string; value: number }[] = []
  const now = new Date(2026, 3, 13)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    data.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      value: Math.floor(Math.random() * (max - min) + min),
    })
  }
  return data
}

export const kpiData: KpiData[] = [
  {
    label: "全体閲覧ユーザー数",
    value: "162",
    unit: "回",
    change: -45,
    changeLabel: "45回",
    data: generateDailyData(30, 2, 10),
  },
  {
    label: "全体アクション数",
    value: "56",
    unit: "回",
    change: -4,
    changeLabel: "4回",
    data: generateDailyData(30, 0, 5),
  },
  {
    label: "全体アクション率",
    value: "34.57",
    unit: "%",
    change: 5.58,
    changeLabel: "5.58%",
    data: generateDailyData(30, 20, 50),
  },
  {
    label: "3位以内率",
    value: "0",
    unit: "%",
    change: 0,
    changeLabel: "",
    data: generateDailyData(30, 0, 0),
  },
]

export const actionData: ActionData[] = (() => {
  const data: ActionData[] = []
  const now = new Date(2026, 3, 13)
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    data.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      website: Math.floor(Math.random() * 4),
      phone: Math.floor(Math.random() * 3),
      route: Math.floor(Math.random() * 2),
    })
  }
  return data
})()

export const rankData: RankData[] = (() => {
  const data: RankData[] = []
  const now = new Date(2026, 3, 13)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    data.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      rank: null,
      keyword: "青山 MEO",
    })
  }
  return data
})()

export const reviewSummary: ReviewSummary = {
  totalCount: 9,
  monthlyCount: 0,
  latestDate: "2026/04/12",
}

export const aggregationPeriod = {
  start: "2026/03/14",
  end: "2026/04/13",
}

export const storeName = "株式会社LIGO"

// --- 店舗基本情報 ---
export const storeBasicInfo = {
  name: "株式会社LIGO",
  businessName: "株式会社LIGO",
  storeCode: "",
  zipCode: "107-0062",
  prefecture: "東京都",
  city: "港区",
  address1: "南青山",
  address2: "2-2-15",
  address3: "",
  address4: "",
  serviceArea: ["日本"],
  websiteUrl: "https://www.li-go.jp/",
  snsProfiles: [
    { platform: "Instagram", url: "https://www.instagram.com/ligo.saiyou/" },
    { platform: "X (Twitter)", url: "https://twitter.com/nagatsumajohnji" },
    { platform: "Youtube", url: "https://www.youtube.com/channel/UCVKJwMFv8dbTOuC" },
    { platform: "Linkedin", url: "https://jp.linkedin.com/in/%E6%BD%A4-%E9%95%B7%E5%A6%BB" },
  ],
  phone1: "03-5776-2504",
  phone2: "",
  businessHours: [
    { day: "日曜日", isHoliday: true, is24h: false, hours: [] },
    { day: "月曜日", isHoliday: false, is24h: false, hours: [{ open: "09:00", close: "18:00" }] },
    { day: "火曜日", isHoliday: false, is24h: false, hours: [{ open: "09:00", close: "18:00" }] },
    { day: "水曜日", isHoliday: false, is24h: false, hours: [{ open: "09:00", close: "18:00" }] },
    { day: "木曜日", isHoliday: false, is24h: false, hours: [{ open: "09:00", close: "18:00" }] },
    { day: "金曜日", isHoliday: false, is24h: false, hours: [{ open: "09:00", close: "18:00" }] },
    { day: "土曜日", isHoliday: true, is24h: false, hours: [] },
  ],
  specialHours: [
    { date: "2023/02/23", isOn: true, is24h: false },
    { date: "2023/03/21", isOn: true, is24h: false },
    { date: "2023/04/29", isOn: true, is24h: false },
    { date: "2023/05/03", isOn: true, is24h: false },
    { date: "2023/05/04", isOn: true, is24h: false },
    { date: "2023/05/05", isOn: true, is24h: false },
  ],
  categories: {
    main: "インターネットマーケティングサービス",
    sub: ["ウェブデザイナー", "マーケティングエージェンシー"],
  },
  description:
    "株式会社LIGOは、MEO対策・SEO対策・Web制作を中心としたデジタルマーケティング企業です。東京都港区南青山に本社を構え、中小企業から大手企業まで幅広いクライアント様のWeb集客をサポートしております。",
  openingDate: "2018/04/01",
}

// --- クチコミ一覧 ---
export const reviewsList = [
  {
    id: "1",
    author: "田中太郎",
    rating: 5,
    date: "2026/03/15",
    text: "とても丁寧な対応で助かりました。MEO対策の効果もすぐに実感できました。",
    reply: "田中様、ありがとうございます。引き続きサポートいたします。",
    replyDate: "2026/03/16",
  },
  {
    id: "2",
    author: "鈴木花子",
    rating: 4,
    date: "2026/02/20",
    text: "SEO対策を依頼しました。順位も上がり、満足しています。",
    reply: "鈴木様、高評価ありがとうございます。",
    replyDate: "2026/02/21",
  },
  {
    id: "3",
    author: "佐藤次郎",
    rating: 5,
    date: "2026/01/10",
    text: "Web制作のクオリティが高く、デザインも素晴らしかったです。",
    reply: null,
    replyDate: null,
  },
  {
    id: "4",
    author: "高橋美咲",
    rating: 3,
    date: "2025/12/05",
    text: "対応は良かったですが、もう少し報告頻度を上げてほしかったです。",
    reply: "高橋様、貴重なご意見ありがとうございます。改善に努めます。",
    replyDate: "2025/12/06",
  },
  {
    id: "5",
    author: "山田一郎",
    rating: 5,
    date: "2025/11/20",
    text: "Google マップでの集客が大幅に改善しました。ありがとうございます！",
    reply: "山田様、嬉しいお言葉をいただきありがとうございます。",
    replyDate: "2025/11/21",
  },
  {
    id: "6",
    author: "中村優子",
    rating: 4,
    date: "2025/10/15",
    text: "レポートが分かりやすく、成果が見えるのが良いです。",
    reply: null,
    replyDate: null,
  },
  {
    id: "7",
    author: "小林健太",
    rating: 5,
    date: "2025/09/01",
    text: "初めてのMEO対策でしたが、丁寧に説明していただけました。",
    reply: "小林様、ありがとうございます。今後ともよろしくお願いいたします。",
    replyDate: "2025/09/02",
  },
  {
    id: "8",
    author: "伊藤真理",
    rating: 4,
    date: "2025/08/10",
    text: "コストパフォーマンスが良いと思います。",
    reply: null,
    replyDate: null,
  },
  {
    id: "9",
    author: "渡辺誠",
    rating: 5,
    date: "2025/07/25",
    text: "迅速な対応と高い専門性に感謝しています。",
    reply: "渡辺様、ありがとうございます！",
    replyDate: "2025/07/26",
  },
]

// --- クチコミ分析 ---
export const reviewAnalysis = {
  averageRating: 4.4,
  ratingDistribution: [
    { stars: 5, count: 5 },
    { stars: 4, count: 3 },
    { stars: 3, count: 1 },
    { stars: 2, count: 0 },
    { stars: 1, count: 0 },
  ],
  monthlyTrend: [
    { month: "2025/07", count: 1, avg: 5.0 },
    { month: "2025/08", count: 1, avg: 4.0 },
    { month: "2025/09", count: 1, avg: 5.0 },
    { month: "2025/10", count: 1, avg: 4.0 },
    { month: "2025/11", count: 1, avg: 5.0 },
    { month: "2025/12", count: 1, avg: 3.0 },
    { month: "2026/01", count: 1, avg: 5.0 },
    { month: "2026/02", count: 1, avg: 4.0 },
    { month: "2026/03", count: 1, avg: 5.0 },
  ],
  keywords: [
    { word: "対応", count: 4 },
    { word: "丁寧", count: 3 },
    { word: "MEO対策", count: 3 },
    { word: "改善", count: 2 },
    { word: "レポート", count: 2 },
    { word: "デザイン", count: 1 },
    { word: "SEO", count: 1 },
    { word: "集客", count: 1 },
  ],
  replyRate: 66.7,
}

// --- 順位データ（拡張） ---
export const rankingChartData = (() => {
  const data: { date: string; keyword1: number | null; keyword2: number | null; keyword3: number | null }[] = []
  const now = new Date(2026, 3, 13)
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    data.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      keyword1: Math.random() > 0.3 ? Math.floor(Math.random() * 45) + 5 : null,
      keyword2: Math.random() > 0.4 ? Math.floor(Math.random() * 30) + 3 : null,
      keyword3: Math.random() > 0.5 ? Math.floor(Math.random() * 50) + 1 : null,
    })
  }
  return data
})()

export const rankingKeywords = [
  { keyword: "青山 MEO", currentRank: null, previousRank: null, bestRank: 15, avgRank: 28.5 },
  { keyword: "港区 Webマーケティング", currentRank: 8, previousRank: 12, bestRank: 5, avgRank: 10.2 },
  { keyword: "南青山 Web制作", currentRank: 3, previousRank: 5, bestRank: 2, avgRank: 6.8 },
]

// --- インサイトデータ ---
export const insightData = {
  searchViews: generateDailyData(30, 50, 200),
  mapViews: generateDailyData(30, 30, 150),
  totalViews: generateDailyData(30, 80, 350),
  searchDirect: 45,
  searchDiscovery: 120,
  searchBranded: 30,
  deviceDesktop: 40,
  deviceMobile: 55,
  deviceTablet: 5,
}

// --- 投稿データ ---
export const postsList = [
  {
    id: "1",
    type: "最新情報",
    title: "年末年始の営業時間のお知らせ",
    content: "年末年始は12/29〜1/3まで休業とさせていただきます。",
    date: "2025/12/20",
    views: 156,
    clicks: 23,
    imageUrl: null,
  },
  {
    id: "2",
    type: "イベント",
    title: "無料MEOセミナー開催",
    content: "2月15日にMEO対策の無料セミナーを開催します。",
    date: "2026/01/25",
    views: 342,
    clicks: 67,
    imageUrl: null,
  },
  {
    id: "3",
    type: "特典",
    title: "新規お申し込みキャンペーン",
    content: "3月中のお申し込みで初月無料！",
    date: "2026/03/01",
    views: 210,
    clicks: 45,
    imageUrl: null,
  },
]

// --- 写真データ ---
export const photosList = [
  { id: "1", category: "外観", url: "/placeholder.jpg", uploadDate: "2025/06/01", views: 1200 },
  { id: "2", category: "内装", url: "/placeholder.jpg", uploadDate: "2025/06/01", views: 890 },
  { id: "3", category: "スタッフ", url: "/placeholder.jpg", uploadDate: "2025/07/15", views: 560 },
  { id: "4", category: "ロゴ", url: "/placeholder.jpg", uploadDate: "2025/06/01", views: 2300 },
]

// --- 競合データ ---
export const competitorData = [
  {
    name: "株式会社LIGO",
    rating: 4.4,
    reviewCount: 9,
    rank: null,
    isOwn: true,
  },
  {
    name: "競合A社",
    rating: 4.2,
    reviewCount: 45,
    rank: 3,
    isOwn: false,
  },
  {
    name: "競合B社",
    rating: 3.8,
    reviewCount: 23,
    rank: 5,
    isOwn: false,
  },
  {
    name: "競合C社",
    rating: 4.6,
    reviewCount: 67,
    rank: 1,
    isOwn: false,
  },
]

// --- FAQ ---
export const faqList = [
  { id: "1", question: "営業時間を教えてください", answer: "平日9:00〜18:00です。土日祝日は休業です。", isPublished: true },
  { id: "2", question: "駐車場はありますか？", answer: "専用駐車場はございませんが、近隣にコインパーキングがございます。", isPublished: true },
  { id: "3", question: "オンラインでの相談は可能ですか？", answer: "はい、Zoom等でのオンライン相談を承っております。", isPublished: true },
]
