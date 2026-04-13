import type { KpiData, ActionData, RankData, ReviewSummary } from "@/types"

function generateDailyData(days: number, min: number, max: number) {
  const data: { date: string; value: number }[] = []
  const now = new Date()
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
  const now = new Date()
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
  const now = new Date()
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
