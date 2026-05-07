"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Download, FileSpreadsheet, FileText } from "lucide-react"
import { actionData, kpiData } from "@/lib/mock-data"
import { arrayToCsv, downloadCsv, todayString } from "@/lib/csv-export"

export default function InsightsDownloadPage() {
  const [period, setPeriod] = useState("30")
  const [format, setFormat] = useState<"csv" | "tsv">("csv")
  const [target, setTarget] = useState<"actions" | "kpi">("actions")
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const days = parseInt(period)

      if (target === "actions") {
        const sliced = actionData.slice(-days)
        const rows = sliced.map((d) => ({
          date: d.date,
          website: d.website,
          phone: d.phone,
          route: d.route,
          total: d.website + d.phone + d.route,
        }))
        const headers = [
          { key: "date" as const, label: "日付" },
          { key: "website" as const, label: "Webサイトクリック" },
          { key: "phone" as const, label: "電話" },
          { key: "route" as const, label: "ルートリクエスト" },
          { key: "total" as const, label: "合計" },
        ]
        const csv = arrayToCsv(rows, headers)
        const ext = format === "tsv" ? "tsv" : "csv"
        downloadCsv(`insights-actions-${days}days-${todayString()}.${ext}`, csv)
      } else {
        const rows = kpiData.map((k) => ({
          label: k.label,
          value: k.value,
          unit: k.unit,
          change: k.changeLabel,
        }))
        const headers = [
          { key: "label" as const, label: "指標" },
          { key: "value" as const, label: "値" },
          { key: "unit" as const, label: "単位" },
          { key: "change" as const, label: "前期比" },
        ]
        const csv = arrayToCsv(rows, headers)
        const ext = format === "tsv" ? "tsv" : "csv"
        downloadCsv(`insights-kpi-${todayString()}.${ext}`, csv)
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
            インサイトデータをCSV/TSV形式でダウンロードできます。Excelで開けます。
          </p>

          {/* Target */}
          <div>
            <label className="text-sm font-medium block mb-2">データ種別</label>
            <div className="flex gap-2">
              {[
                { key: "actions" as const, label: "アクション日別データ" },
                { key: "kpi" as const, label: "KPIサマリー" },
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

          {target === "actions" && (
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
