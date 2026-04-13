import { google } from "googleapis"

/**
 * Google Business Profile API client
 * Uses the user's OAuth access token to make requests
 */
export function createGbpClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })

  const mybusinessbusinessinformation =
    google.mybusinessbusinessinformation({ version: "v1", auth })
  const mybusinessaccountmanagement =
    google.mybusinessaccountmanagement({ version: "v1", auth })

  return {
    /**
     * List all GBP accounts for the authenticated user
     */
    async listAccounts() {
      const res = await mybusinessaccountmanagement.accounts.list()
      return res.data.accounts || []
    },

    /**
     * List all locations for a given account
     */
    async listLocations(accountId: string) {
      const parent = accountId.startsWith("accounts/")
        ? accountId
        : `accounts/${accountId}`
      const res = await mybusinessbusinessinformation.accounts.locations.list({
        parent,
        readMask: "name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,specialHours,categories,profile,metadata,latlng",
      })
      return res.data.locations || []
    },

    /**
     * Get a single location by name
     */
    async getLocation(locationName: string) {
      const res = await mybusinessbusinessinformation.locations.get({
        name: locationName,
        readMask: "name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,specialHours,categories,profile,metadata,latlng,serviceArea,labels",
      })
      return res.data
    },

    /**
     * Update location fields
     */
    async updateLocation(locationName: string, updateMask: string, body: Record<string, unknown>) {
      const res = await mybusinessbusinessinformation.locations.patch({
        name: locationName,
        updateMask,
        requestBody: body,
      })
      return res.data
    },
  }
}

/**
 * Google My Business API client for reviews and insights
 * Note: Some of these APIs use the older v4 endpoint
 */
export function createGmbClient(accessToken: string) {
  const baseUrl = "https://mybusiness.googleapis.com/v4"

  async function fetchApi(path: string, options?: RequestInit) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    })
    if (!res.ok) {
      const error = await res.text()
      throw new Error(`GMB API error: ${res.status} ${error}`)
    }
    return res.json()
  }

  return {
    /**
     * List reviews for a location
     */
    async listReviews(locationName: string, pageSize = 50, pageToken?: string) {
      const params = new URLSearchParams({ pageSize: String(pageSize) })
      if (pageToken) params.set("pageToken", pageToken)
      return fetchApi(`/${locationName}/reviews?${params}`)
    },

    /**
     * Reply to a review
     */
    async replyToReview(reviewName: string, comment: string) {
      return fetchApi(`/${reviewName}/reply`, {
        method: "PUT",
        body: JSON.stringify({ comment }),
      })
    },

    /**
     * Get location insights (performance metrics)
     * Note: This uses the Business Performance API
     */
    async getInsights(locationName: string, startDate: string, endDate: string) {
      // Business Performance API endpoint
      const performanceUrl = "https://businessprofileperformance.googleapis.com/v1"
      const res = await fetch(
        `${performanceUrl}/${locationName}:getDailyMetricsTimeSeries?` +
          new URLSearchParams({
            "dailyMetric": "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
            "dailyRange.startDate.year": startDate.split("-")[0],
            "dailyRange.startDate.month": startDate.split("-")[1],
            "dailyRange.startDate.day": startDate.split("-")[2],
            "dailyRange.endDate.year": endDate.split("-")[0],
            "dailyRange.endDate.month": endDate.split("-")[1],
            "dailyRange.endDate.day": endDate.split("-")[2],
          }),
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )
      if (!res.ok) throw new Error(`Performance API error: ${res.status}`)
      return res.json()
    },

    /**
     * List local posts
     */
    async listPosts(locationName: string) {
      return fetchApi(`/${locationName}/localPosts`)
    },

    /**
     * Create a local post
     */
    async createPost(locationName: string, post: Record<string, unknown>) {
      return fetchApi(`/${locationName}/localPosts`, {
        method: "POST",
        body: JSON.stringify(post),
      })
    },

    /**
     * List media items (photos/videos)
     */
    async listMedia(locationName: string) {
      return fetchApi(`/${locationName}/media`)
    },
  }
}
