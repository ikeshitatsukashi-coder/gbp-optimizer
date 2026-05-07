/**
 * Convert array of objects to CSV string.
 * Adds BOM for Excel compatibility with Japanese characters.
 */
export function arrayToCsv<T extends Record<string, unknown>>(
  rows: T[],
  headers: { key: keyof T; label: string }[]
): string {
  const headerLine = headers.map((h) => escapeCsvCell(h.label)).join(",")
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvCell(String(row[h.key] ?? ""))).join(",")
  )
  return "﻿" + [headerLine, ...dataLines].join("\r\n")
}

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Trigger CSV file download in the browser
 */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Get today's date in YYYY-MM-DD format for filenames
 */
export function todayString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
