export interface KpiData {
  label: string
  value: string
  unit: string
  change: number
  changeLabel: string
  data: { date: string; value: number }[]
}

export interface ActionData {
  date: string
  website: number
  phone: number
  route: number
}

export interface RankData {
  date: string
  rank: number | null
  keyword: string
}

export interface ReviewSummary {
  totalCount: number
  monthlyCount: number
  latestDate: string
}

export interface MenuItem {
  label: string
  href: string
  icon?: string
}

export interface MenuGroup {
  label: string
  icon: string
  href?: string
  children?: MenuItem[]
}

export interface StoreInfo {
  name: string
  businessName: string
  storeCode: string
  zipCode: string
  prefecture: string
  city: string
  address1: string
  address2: string
  address3: string
  address4: string
  serviceArea: string[]
  websiteUrl: string
  snsProfiles: { platform: string; url: string }[]
  phone1: string
  phone2: string
  businessHours: {
    day: string
    isHoliday: boolean
    is24h: boolean
    hours: { open: string; close: string }[]
  }[]
  specialHours: {
    date: string
    isOn: boolean
    is24h: boolean
    hours?: { open: string; close: string }
  }[]
}
