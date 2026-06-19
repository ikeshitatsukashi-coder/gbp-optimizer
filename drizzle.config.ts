import { config as dotenvConfig } from "dotenv"
import { defineConfig } from "drizzle-kit"

// Next.js convention: load .env.local first, then .env as fallback
dotenvConfig({ path: ".env.local" })
dotenvConfig({ path: ".env" })

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Run `vercel env pull .env.local` first.")
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
})
