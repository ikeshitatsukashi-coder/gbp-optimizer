"use client"

import { useState, useEffect, useCallback } from "react"

const USE_MOCK = !process.env.NEXT_PUBLIC_USE_API

/**
 * Generic fetch hook with mock fallback
 */
export function useApiData<T>(
  url: string,
  mockData: T,
  enabled = true
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(USE_MOCK ? mockData : null)
  const [loading, setLoading] = useState(!USE_MOCK && enabled)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (USE_MOCK || !enabled) {
      setData(mockData)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url)
      if (!res.ok) {
        if (res.status === 401) {
          setError("ログインが必要です")
          return
        }
        throw new Error(`API error: ${res.status}`)
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error("API fetch error:", err)
      setError(err instanceof Error ? err.message : "データの取得に失敗しました")
      // Fall back to mock data on error
      setData(mockData)
    } finally {
      setLoading(false)
    }
  }, [url, enabled, mockData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}

/**
 * Post/Put/Delete API call
 */
export async function apiMutate(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: Record<string, unknown>
) {
  if (USE_MOCK) {
    // Simulate success in mock mode
    return { success: true }
  }

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`API error: ${res.status} ${error}`)
  }

  return res.json()
}
