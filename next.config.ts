import type { NextConfig } from "next"

/**
 * Security headers applied to all routes.
 * - X-Frame-Options: Prevent clickjacking
 * - X-Content-Type-Options: Prevent MIME-sniffing
 * - Referrer-Policy: Limit referrer info leakage
 * - Permissions-Policy: Disable unused browser features
 * - Strict-Transport-Security: Force HTTPS
 * - Content-Security-Policy: Restrict resource loading
 */
const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://accounts.google.com https://*.googleapis.com",
      "frame-src https://accounts.google.com",
      "frame-ancestors 'none'",
      "form-action 'self' https://accounts.google.com",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
  // Disable powered-by header
  poweredByHeader: false,
}

export default nextConfig
