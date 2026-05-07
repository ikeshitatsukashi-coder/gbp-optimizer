"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Download, FileSpreadsheet, FileText } from "lucide-react"
import { rankingChartData, rankingKeywords } from "@/lib/mock-data"
import { arrayToCsv, downloadCsv, todayString } from "@/lib/csv-export"

export default function RankingDownloadPage() {
  const [period, setPeriod] = useState("30")
  const [format, setFormat] = useState<"csv" | "tsv">("csv")
  const [target, setTarget] = useState<"summary" | "daily">("summary")
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const days = parseInt(period)

      if (target === "summary") {
        const rows = rankingKeywords.map((kw) => ({
          keyword: kw.keyword,
          currentRank: kw.currentRank ?? "圏外",
          previousRank: kw.previousRank ?? "圏外",
          bestRank: kw.bestRank ?? "-",
          avgRank: kw.avgRank,
        }))
        const headers = [
          { key: "keyword" as const, label: "キーワード" },
          { key: "currentRank" as const, label: "現在順位" },
          { key: "previousRank" as const, label: "前回順位" },
          { key: "bestRank" as const, label: "最高順位" },
          { key: "avgRank" as const, label: "平均順位" },
        ]
        const csv = arrayToCsv(rows, headers)
        const ext = format === "tsv" ? "tsv" : "csv"
        downloadCsv(`ranking-summary-${todayString()}.${ext}`, csv)
      } else {
        // Daily data
        const sliced = rankingChartData.slice(-days)
        const rows = sliced.map((d) => ({
          date: d.date,
          keyword1: d.keyword1 ?? "圏外",
          keyword2: d.keyword2 ?? "圏外",
          keyword3: d.keyword3 ?? "圏外",
        }))
        const headers = [
          { key: "date" as const, label: "日付" },
          { key: "keyword1" as const, label: "青山 MEO" },
          { key: "keyword2" as const, label: "港区 Webマーケティング" },
          { key: "keyword3" as const, label: "南青山 Web制作" },
        ]
        const csv = arrayToCsv(rows, headers)
        const ext = format === "tsv" ? "tsv" : "csv"
        downloadCsv(`ranking-daily-${days}days-${todayString()}.${ext}`, csv)
      }
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">データダウンロード</h1>

      <Card className="mb-6">
        <CardContent className="p-6 space-y-5">
          <p className="text-sm text-muted-foreground">
            順位データをCSV/TSV形式でダウンロードできます。Excelで開けます。
          </p>

          {/* Target */}
          <div>
            <label className="text-sm font-medium block mb-2">データ種別</label>
            <div className="flex gap-2">
              {[
                { key: "summary" as const, label: "順位サマリー" },
                { key: "daily" as const, label: "日別順位データ" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTarget(t.key)}
                  className={`px-4 py-2 text-sm rounded border ${
                    target === t.key
                      ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                      : "bg-white border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Period (only for daily) */}
          {target === "daily" && (
            <div>
              <label className="text-sm font-medium block mb-2">期間</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="border rounded px-3 py-2 text-sm w-48"
              >
                <option value="7">直近7日間</option>
                <option value="14">直近14日間</option>
                <option value="30">直近30日間</option>
                <option value="60">直近60日間</option>
                <option value="90">直近90日間</option>
              </select>
            </div>
          )}

          {/* Format */}
          <div>
            <label className="text-sm font-medium block mb-2">ファイル形式</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat("csv")}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded border ${
                  format === "csv"
                    ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                    : "bg-white border-gray-300 hover:bg-gray-50"
                }`}
              >
                <FileText className="h-4 w-4" />
                CSV
              </button>
              <button
                onClick={() => setFormat("tsv")}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded border ${
                  format === "tsv"
                    ? "bg-[#2c3e50] text-white border-[#2c3e50]"
                    : "bg-white border-gray-300 hover:bg-gray-50"
                }`}
              >
                <FileSpreadsheet className="h-4 w-4" />
                TSV (Excel貼付向き)
              </button>
            </div>
          </div>

          <hr />

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {downloading ? "ダウンロード中..." : "ダウンロード"}
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
