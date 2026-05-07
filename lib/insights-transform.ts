import type { KpiData, ActionData } from "@/types"

interface TimeSeriesPoint {
  date: { year: number; month: number; day: number }
  value: string | number
}

interface MetricSeries {
  dailyMetric: string
  timeSeries: { datedValues?: TimeSeriesPoint[] }
}

interface InsightsResponse {
  multiDailyMetricTimeSeries?: Array<{
    dailyMetricTimeSeries?: MetricSeries[]
  }>
}

function getMetricSeries(
  data: InsightsResponse,
  metricName: string
): TimeSeriesPoint[] {
  if (!data.multiDailyMetricTimeSeries) return []
  for (const group of data.multiDailyMetricTimeSeries) {
    if (!group.dailyMetricTimeSeries) continue
    for (const series of group.dailyMetricTimeSeries) {
      if (series.dailyMetric === metricName) {
        return series.timeSeries?.datedValues || []
      }
    }
  }
  return []
}

function formatDate(d: { year: number; month: number; day: number }): string {
  return `${d.month}/${d.day}`
}

function sumValues(points: TimeSeriesPoint[]): number {
  return points.reduce((s, p) => s + Number(p.value || 0), 0)
}

/**
 * Transform Insights API response into dashboard KPI data
 */
export function transformInsightsToKpi(
  data: InsightsResponse | null
): KpiData[] | null {
  if (!data) return null

  const desktopMaps = getMetricSeries(data, "BUSINESS_IMPRESSIONS_DESKTOP_MAPS")
  const desktopSearch = getMetricSeries(data, "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH")
  const mobileMaps = getMetricSeries(data, "BUSINESS_IMPRESSIONS_MOBILE_MAPS")
  const mobileSearch = getMetricSeries(data, "BUSINESS_IMPRESSIONS_MOBILE_SEARCH")
  const directions = getMetricSeries(data, "BUSINESS_DIRECTION_REQUESTS")
  const calls = getMetricSeries(data, "CALL_CLICKS")
  const website = getMetricSeries(data, "WEBSITE_CLICKS")

  // Total impressions = all 4 impression metrics summed
  const allImpressions = [desktopMaps, desktopSearch, mobileMaps, mobileSearch]
  const totalImpressions = allImpressions.reduce((sum, s) => sum + sumValues(s), 0)

  // Total actions = website clicks + calls + direction requests
  const totalActions = sumValues(directions) + sumValues(calls) + sumValues(website)

  const actionRate =
    totalImpressions > 0 ? ((totalActions / totalImpressions) * 100).toFixed(2) : "0.00"

  // Build daily time series for each KPI by summing across days
  const days = desktopMaps.length || mobileSearch.length || 30
  const impressionsTrend: { date: string; value: number }[] = []
  const actionsTrend: { date: string; value: number }[] = []
  const rateTrend: { date: string; value: number }[] = []

  for (let i = 0; i < days; i++) {
    const d = desktopMaps[i] || mobileSearch[i] || desktopSearch[i] || mobileMaps[i]
    if (!d) continue
    const date = formatDate(d.date)

    const dayImpressions =
      Number(desktopMaps[i]?.value || 0) +
      Number(desktopSearch[i]?.value || 0) +
      Number(mobileMaps[i]?.value || 0) +
      Number(mobileSearch[i]?.value || 0)
    const dayActions =
      Number(directions[i]?.value || 0) +
      Number(calls[i]?.value || 0) +
      Number(website[i]?.value || 0)
    const dayRate = dayImpressions > 0 ? (dayActions / dayImpressions) * 100 : 0

    impressionsTrend.push({ date, value: dayImpressions })
    actionsTrend.push({ date, value: dayActions })
    rateTrend.push({ date, value: dayRate })
  }

  return [
    {
      label: "全体閲覧ユーザー数",
      value: totalImpressions.toLocaleString(),
      unit: "回",
      change: 0,
      changeLabel: "",
      data: impressionsTrend,
    },
    {
      label: "全体アクション数",
      value: totalActions.toLocaleString(),
      unit: "回",
      change: 0,
      changeLabel: "",
      data: actionsTrend,
    },
    {
      label: "全体アクション率",
      value: actionRate,
      unit: "%",
      change: 0,
      changeLabel: "",
      data: rateTrend,
    },
    {
      label: "3位以内率",
      value: "0",
      unit: "%",
      change: 0,
      changeLabel: "",
      data: [],
    },
  ]
}

/**
 * Transform Insights API response into Action Chart data
 */
export function transformInsightsToActionChart(
  data: InsightsResponse | null
): ActionData[] | null {
  if (!data) return null

  const directions = getMetricSeries(data, "BUSINESS_DIRECTION_REQUESTS")
  const calls = getMetricSeries(data, "CALL_CLICKS")
  const website = getMetricSeries(data, "WEBSITE_CLICKS")

  const length = Math.max(directions.length, calls.length, website.length)
  const result: ActionData[] = []

  for (let i = 0; i < length; i++) {
    const ref = directions[i] || calls[i] || website[i]
    if (!ref) continue
    result.push({
      date: formatDate(ref.date),
      website: Number(website[i]?.value || 0),
      phone: Number(calls[i]?.value || 0),
      route: Number(directions[i]?.value || 0),
    })
  }

  return result
}
