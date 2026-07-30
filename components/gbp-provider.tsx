"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { GbpContext } from "@/lib/store"
import type { GbpLocation } from "@/lib/store"

const ARCHIVE_KEY = "gbp-archived-locations"
const SELECTED_KEY = "gbp-selected-location"

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

  // 最後に選択した店舗を記憶（次回アクセス時のデフォルトにする）
  useEffect(() => {
    if (!locationName) return
    try {
      localStorage.setItem(SELECTED_KEY, locationName)
    } catch (err) {
      console.error("Failed to save selected location:", err)
    }
  }, [locationName])

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
      let mapped: GbpLocation[] = []

      // 1) まず社内DB（同期済み店舗マスタ）から即座に取得する。
      //    Google API を毎回叩くと478店舗のページングで数十秒かかり
      //    タイムアウトして「店舗なし」になるため。
      try {
        const dbRes = await fetch("/api/stores?status=active&scope=operational&limit=2000")
        if (dbRes.ok) {
          const dbData = await dbRes.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mapped = (dbData.stores ?? []).map((s: any) => {
            const addr = s.address
            const addressLine = addr
              ? [addr.administrativeArea, addr.locality, ...(addr.addressLines || [])]
                  .filter(Boolean)
                  .join(" ")
              : ""
            return {
              name: s.locationName,
              title: s.title || s.locationName,
              address: addressLine,
            }
          })
          const firstAccount = (dbData.stores ?? [])[0]?.accountName
          if (firstAccount) setAccountId(firstAccount)
        }
      } catch (e) {
        console.error("DB stores fetch failed:", e)
      }

      // 2) DBが空（初回・未同期）のときだけ Google API にフォールバック
      if (mapped.length === 0) {
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
        mapped = locs.map((l: any) => {
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
      }

      if (mapped.length === 0) return
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
      // 前回選択した店舗があればそれを復元、なければ先頭の非アーカイブ店舗
      const savedSelected = (() => {
        try {
          return localStorage.getItem(SELECTED_KEY)
        } catch {
          return null
        }
      })()
      const restored = savedSelected
        ? mapped.find((l) => l.name === savedSelected && !currentArchived.has(l.name))
        : undefined
      const firstActive = restored ?? mapped.find((l) => !currentArchived.has(l.name))
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
