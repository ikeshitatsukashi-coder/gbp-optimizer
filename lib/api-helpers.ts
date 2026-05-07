import { NextResponse } from "next/server"

const isDev = process.env.NODE_ENV !== "production"

/**
 * Build a safe error response.
 * In production, hides internal error details from the client.
 */
export function errorResponse(message: string, error: unknown, status = 500) {
  const detail = error instanceof Error ? error.message : String(error)
  console.error(`[API Error] ${message}:`, detail)

  return NextResponse.json(
    {
      error: message,
      ...(isDev ? { detail } : {}),
    },
    { status }
  )
}
