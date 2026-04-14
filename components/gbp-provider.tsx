"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { GbpContext } from "@/lib/store"
import type { GbpLocation } from "@/lib/store"

export function GbpProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [accountId, setAccountId] = useState<string | null>(null)
  const [locationName, setLocationName] = useState<string | null>(null)
  const [locations, setLocations] = useState<GbpLocation[]>([])
  const [loading, setLoading] = useState(false)
  const initialized = useRef(false)

  const initializeGbp = useCallback(async () => {
    if (!session) {
      setLocations([])
      setLocationName(null)
      setAccountId(null)
      initialized.current = false
      return
    }

    // Only run once per session to avoid repeated API calls
    if (initialized.current) return
    initialized.current = true

    setLoading(true)
    try {
      // Fetch accounts
      const accRes = await fetch("/api/gbp/accounts")
      if (!accRes.ok) {
        console.error("Accounts API error:", accRes.status)
        return
      }
      const accData = await accRes.json()
      const accounts = accData.accounts
      if (!accounts || accounts.length === 0) {
        console.warn("No GBP accounts found")
        return
      }

      const accId = accounts[0].name
      setAccountId(accId)

      // Fetch locations for this account
      const locRes = await fetch(`/api/gbp/locations?accountId=${encodeURIComponent(accId)}`)
      if (!locRes.ok) {
        console.error("Locations API error:", locRes.status)
        return
      }
      const locData = await locRes.json()
      const locs = locData.locations
      if (!locs || locs.length === 0) {
        console.warn("No locations found")
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedLocations: GbpLocation[] = locs.map((l: any) => ({
        name: l.name,
        title: l.title || l.name,
      }))

      setLocations(mappedLocations)
      setLocationName(mappedLocations[0].name)
    } catch (err) {
      console.error("Failed to initialize GBP:", err)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    initializeGbp()
  }, [initializeGbp])

  return (
    <GbpContext.Provider value={{ accountId, locationName, locations, loading, setAccountId, setLocationName }}>
      {children}
    </GbpContext.Provider>
  )
}
