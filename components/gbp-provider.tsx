"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { GbpContext } from "@/lib/store"

export function GbpProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [accountId, setAccountId] = useState<string | null>(null)
  const [locationName, setLocationName] = useState<string | null>(null)

  // Auto-fetch account and location on login
  const initializeGbp = useCallback(async () => {
    if (!session) return

    try {
      // Fetch accounts
      const accRes = await fetch("/api/gbp/accounts")
      if (!accRes.ok) return
      const accData = await accRes.json()
      const accounts = accData.accounts
      if (!accounts || accounts.length === 0) return

      const firstAccount = accounts[0]
      const accId = firstAccount.name // e.g. "accounts/123456"
      setAccountId(accId)

      // Fetch locations for this account
      const locRes = await fetch(`/api/gbp/locations?accountId=${encodeURIComponent(accId)}`)
      if (!locRes.ok) return
      const locData = await locRes.json()
      const locations = locData.locations
      if (!locations || locations.length === 0) return

      setLocationName(locations[0].name) // e.g. "locations/123456"
    } catch (err) {
      console.error("Failed to initialize GBP:", err)
    }
  }, [session])

  useEffect(() => {
    initializeGbp()
  }, [initializeGbp])

  return (
    <GbpContext.Provider value={{ accountId, locationName, setAccountId, setLocationName }}>
      {children}
    </GbpContext.Provider>
  )
}
