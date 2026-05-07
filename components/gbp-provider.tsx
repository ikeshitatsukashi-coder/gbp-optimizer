"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { GbpContext } from "@/lib/store"
import type { GbpLocation } from "@/lib/store"

const ARCHIVE_KEY = "gbp-archived-locations"

export function GbpProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [accountId, setAccountId] = useState<string | null>(null)
  const [locationName, setLocationName] = useState<string | null>(null)
  const [allLocations, setAllLocations] = useState<GbpLocation[]>([])
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const initialized = useRef(false)

  // Load archived from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ARCHIVE_KEY)
      if (saved) {
        setArchivedIds(new Set(JSON.parse(saved)))
      }
    } catch (err) {
      console.error("Failed to load archived ids:", err)
    }
  }, [])

  // Save archived to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...archivedIds]))
    } catch (err) {
      console.error("Failed to save archived ids:", err)
    }
  }, [archivedIds])

  const archiveLocation = (name: string) => {
    setArchivedIds((prev) => new Set([...prev, name]))
    // If currently selected location is archived, switch to first active one
    if (locationName === name) {
      const firstActive = allLocations.find((l) => l.name !== name && !archivedIds.has(l.name))
      if (firstActive) {
        setLocationName(firstActive.name)
      }
    }
  }

  const unarchiveLocation = (name: string) => {
    setArchivedIds((prev) => {
      const next = new Set(prev)
      next.delete(name)
      return next
    })
  }

  const initializeGbp = useCallback(async () => {
    if (!session) {
      setAllLocations([])
      setLocationName(null)
      setAccountId(null)
      initialized.current = false
      return
    }

    if (initialized.current) return
    initialized.current = true

    setLoading(true)
    try {
      const accRes = await fetch("/api/gbp/accounts")
      if (!accRes.ok) {
        console.error("Accounts API error:", accRes.status)
        return
      }
      const accData = await accRes.json()
      const accounts = accData.accounts
      if (!accounts || accounts.length === 0) return

      const accId = accounts[0].name
      setAccountId(accId)

      const locRes = await fetch(`/api/gbp/locations?accountId=${encodeURIComponent(accId)}`)
      if (!locRes.ok) {
        console.error("Locations API error:", locRes.status)
        return
      }
      const locData = await locRes.json()
      const locs = locData.locations
      if (!locs || locs.length === 0) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: GbpLocation[] = locs.map((l: any) => {
        const addr = l.storefrontAddress
        const addressLine = addr
          ? [addr.administrativeArea, addr.locality, ...(addr.addressLines || [])]
              .filter(Boolean)
              .join(" ")
          : ""
        return {
          name: l.name,
          title: l.title || l.name,
          address: addressLine,
        }
      })

      setAllLocations(mapped)

      // Pick first non-archived as default
      const currentArchived = (() => {
        try {
          const saved = localStorage.getItem(ARCHIVE_KEY)
          return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>()
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_err) {
          return new Set<string>()
        }
      })()
      const firstActive = mapped.find((l) => !currentArchived.has(l.name))
      if (firstActive) {
        setLocationName(firstActive.name)
      }
    } catch (err) {
      console.error("Failed to initialize GBP:", err)
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    initializeGbp()
  }, [initializeGbp])

  const locations = allLocations.filter((l) => !archivedIds.has(l.name))
  const archivedLocations = allLocations.filter((l) => archivedIds.has(l.name))

  return (
    <GbpContext.Provider
      value={{
        accountId,
        locationName,
        locations,
        archivedLocations,
        archivedIds,
        loading,
        setAccountId,
        setLocationName,
        archiveLocation,
        unarchiveLocation,
      }}
    >
      {children}
    </GbpContext.Provider>
  )
}
