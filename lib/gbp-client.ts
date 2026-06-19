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
     * List all locations for a given account (with pagination)
     */
    async listLocations(accountId: string) {
      const parent = accountId.startsWith("accounts/")
        ? accountId
        : `accounts/${accountId}`

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allLocations: any[] = []
      let pageToken: string | undefined = undefined
      let hasMore = true

      while (hasMore) {
        const params: { parent: string; pageSize: number; readMask: string; pageToken?: string } = {
          parent,
          pageSize: 100,
          readMask: "name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,specialHours,categories,profile,metadata,latlng",
        }
        if (pageToken) params.pageToken = pageToken

        const res = await mybusinessbusinessinformation.accounts.locations.list(params)

        if (res.data.locations) {
          allLocations.push(...res.data.locations)
        }

        if (res.data.nextPageToken) {
          pageToken = res.data.nextPageToken
        } else {
          hasMore = false
        }
      }

      return allLocations
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

  /**
   * v4 API は `accounts/{accountId}/locations/{locationId}/...` 形式の path を要求する。
   * locationName 単体（`locations/{id}`）では 404 になるため、accountName と組み合わせて完全な path を作る。
   */
  function buildV4Path(accountName: string, locationName: string, suffix: string): string {
    const account = accountName.startsWith("accounts/")
      ? accountName
      : `accounts/${accountName}`
    const location = locationName.startsWith("locations/")
      ? locationName
      : `locations/${locationName}`
    return `/${account}/${location}/${suffix}`
  }

  return {
    /**
     * List reviews for a location (v4 requires accounts/.../locations/.../reviews)
     */
    async listReviews(
      accountName: string,
      locationName: string,
      pageSize = 50,
      pageToken?: string
    ) {
      const params = new URLSearchParams({ pageSize: String(pageSize) })
      if (pageToken) params.set("pageToken", pageToken)
      return fetchApi(`${buildV4Path(accountName, locationName, "reviews")}?${params}`)
    },

    /**
     * Reply to a review
     * reviewName is the full resource name: accounts/.../locations/.../reviews/{reviewId}
     */
    async replyToReview(reviewName: string, comment: string) {
      return fetchApi(`/${reviewName}/reply`, {
        method: "PUT",
        body: JSON.stringify({ comment }),
      })
    },

    /**
     * Get location insights (performance metrics) — multi-metric
     * Returns daily time series for all key metrics
     */
    async getInsights(locationName: string, startDate: string, endDate: string) {
      const performanceUrl = "https://businessprofileperformance.googleapis.com/v1"
      const [sy, sm, sd] = startDate.split("-")
      const [ey, em, ed] = endDate.split("-")

      const metrics = [
        "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
        "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
        "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
        "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
        "BUSINESS_DIRECTION_REQUESTS",
        "CALL_CLICKS",
        "WEBSITE_CLICKS",
      ]

      const params = new URLSearchParams()
      metrics.forEach((m) => params.append("dailyMetrics", m))
      params.set("dailyRange.startDate.year", sy)
      params.set("dailyRange.startDate.month", sm)
      params.set("dailyRange.startDate.day", sd)
      params.set("dailyRange.endDate.year", ey)
      params.set("dailyRange.endDate.month", em)
      params.set("dailyRange.endDate.day", ed)

      const res = await fetch(
        `${performanceUrl}/${locationName}:fetchMultiDailyMetricsTimeSeries?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`Performance API error: ${res.status} ${txt}`)
      }
      return res.json()
    },

    /**
     * List local posts (v4)
     */
    async listPosts(accountName: string, locationName: string) {
      return fetchApi(buildV4Path(accountName, locationName, "localPosts"))
    },

    /**
     * Create a local post (v4)
     */
    async createPost(
      accountName: string,
      locationName: string,
      post: Record<string, unknown>
    ) {
      return fetchApi(buildV4Path(accountName, locationName, "localPosts"), {
        method: "POST",
        body: JSON.stringify(post),
      })
    },

    /**
     * List media items (photos/videos) (v4)
     */
    async listMedia(accountName: string, locationName: string) {
      return fetchApi(buildV4Path(accountName, locationName, "media"))
    },
  }
}
