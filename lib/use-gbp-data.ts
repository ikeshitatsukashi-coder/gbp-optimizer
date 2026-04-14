"use client"

import { useState, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { useGbp } from "@/lib/store"

/**
 * Hook to fetch GBP API data with automatic mock fallback.
 * Only fetches once per locationName change to avoid rate limiting.
 */
export function useGbpData<T>(
  endpoint: string,
  mockData: T,
  params?: Record<string, string>
): { data: T; loading: boolean; error: string | null; refetch: () => void } {
  const { data: session } = useSession()
  const { locationName } = useGbp()
  const [data, setData] = useState<T>(mockData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchedFor = useRef<string | null>(null)

  const fetchData = async () => {
    // Use mock if not logged in or no location
    if (!session || !locationName) {
      setData(mockData)
      return
    }

    // Skip if already fetched for this location (unless manual refetch)
    if (fetchedFor.current === `${locationName}:${endpoint}`) return
    fetchedFor.current = `${locationName}:${endpoint}`

    setLoading(true)
    setError(null)

    try {
      const searchParams = new URLSearchParams({
        locationName,
        ...params,
      })
      const res = await fetch(`/api/gbp/${endpoint}?${searchParams}`)

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`)
      }

      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error(`Failed to fetch ${endpoint}:`, err)
      setError(err instanceof Error ? err.message : "取得失敗")
      setData(mockData)
    } finally {
      setLoading(false)
    }
  }

  const refetch = () => {
    fetchedFor.current = null
    fetchData()
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, locationName])

  return { data, loading, error, refetch }
}
