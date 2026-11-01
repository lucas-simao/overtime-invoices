export type Profile = {
  issuer: {
    legalName: string
    addressLines: string[]
    signName: string
    shortName: string
  }
  billTo: {
    name: string
    addressLines: string[]
  }
  serviceDescription: string
  hourlyRate: number
  overtimePercent: number
  hoursPerBusinessDay: number
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
