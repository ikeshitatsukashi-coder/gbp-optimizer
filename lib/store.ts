"use client"

import { createContext, useContext } from "react"

export interface GbpContextType {
  accountId: string | null
  locationName: string | null
  setAccountId: (id: string) => void
  setLocationName: (name: string) => void
}

export const GbpContext = createContext<GbpContextType>({
  accountId: null,
  locationName: null,
  setAccountId: () => {},
  setLocationName: () => {},
})

export function useGbp() {
  return useContext(GbpContext)
}
