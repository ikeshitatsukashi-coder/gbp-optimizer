"use client"

import { SessionProvider } from "next-auth/react"
import { GbpProvider } from "@/components/gbp-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <GbpProvider>{children}</GbpProvider>
    </SessionProvider>
  )
}
