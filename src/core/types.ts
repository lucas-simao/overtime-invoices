export type Profile = {
  issuer: {
    legalName: string
    addressLines: string[]
    signName: string
    shortName: string
    /** A PNG or JPEG data URL. */
    logo?: string
  }
  billTo: {
    name: string
    addressLines: string[]
    /** A PNG or JPEG data URL. */
    logo?: string
  }
  serviceDescription: string
  hourlyRate: number
  overtimePercent: number
  hoursPerBusinessDay: number
  /** Weekdays paid in the base salary, 0 = Sunday … 6 = Saturday. Absent means Monday to Friday. */
  workDays?: number[]
  recipientName: string
}

export type DayEntry = {
  day: number
  month: number
  /** Only when the notes wrote the year (01/10/2026, 2026-10-01). */
  year?: number
  hours: number
  minutes: number
  totalMinutes: number
  tasks: string[]
}

export type Calculation = {
  year: number
  month: number
  businessDays: number
  workDays: number[]
  hoursPerBusinessDay: number
  baseHours: number
  hourlyCents: number
  baseCents: number
  overtimePercent: number
  overtimeRateCents: number
  overtimeMinutes: number
  overtimeCents: number
  exactTotalCents: number
  invoiceCents: number
  invoiceId: string
  invoiceYear: number
  invoiceMonth: number
  invoiceDay: number
  periodEndDay: number
  days: DayEntry[]
}
