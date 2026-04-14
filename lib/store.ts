"use client"

import { createContext, useContext } from "react"

export interface GbpLocation {
  name: string // e.g. "locations/123456"
  title: string // e.g. "株式会社LIGO"
}

export interface GbpContextType {
  accountId: string | null
  locationName: string | null
  locations: GbpLocation[]
  loading: boolean
  setAccountId: (id: string) => void
  setLocationName: (name: string) => void
}

export const GbpContext = createContext<GbpContextType>({
  accountId: null,
  locationName: null,
  locations: [],
  loading: false,
  setAccountId: () => {},
  setLocationName: () => {},
})

export function useGbp() {
  return useContext(GbpContext)
}
