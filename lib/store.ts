"use client"

import { createContext, useContext } from "react"

export interface GbpLocation {
  name: string // e.g. "locations/123456"
  title: string // e.g. "株式会社LIGO"
  address?: string
}

export interface GbpContextType {
  accountId: string | null
  locationName: string | null
  locations: GbpLocation[] // active (non-archived)
  archivedLocations: GbpLocation[]
  archivedIds: Set<string>
  loading: boolean
  setAccountId: (id: string) => void
  setLocationName: (name: string) => void
  archiveLocation: (locationName: string) => void
  unarchiveLocation: (locationName: string) => void
}

export const GbpContext = createContext<GbpContextType>({
  accountId: null,
  locationName: null,
  locations: [],
  archivedLocations: [],
  archivedIds: new Set(),
  loading: false,
  setAccountId: () => {},
  setLocationName: () => {},
  archiveLocation: () => {},
  unarchiveLocation: () => {},
})

export function useGbp() {
  return useContext(GbpContext)
}
