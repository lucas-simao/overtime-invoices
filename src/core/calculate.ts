import { countBusinessDays, daysInMonth, invoiceIdentity } from './dates'
import { dollarsToCents, floorToDollar, overtimeAmountCents, overtimeRateCents } from './money'
import type { Calculation, DayEntry } from './types'

export function calculate(input: {
  year: number
  month: number
  hourlyRate: number
  overtimePercent: number
  hoursPerBusinessDay: number
  days: DayEntry[]
}): Calculation {
  const hourlyCents = dollarsToCents(input.hourlyRate)
  const businessDays = countBusinessDays(input.year, input.month)
  const baseHours = businessDays * input.hoursPerBusinessDay
  const baseCents = Math.round(baseHours * hourlyCents)
  const rateCents = overtimeRateCents(hourlyCents, input.overtimePercent)
  const overtimeMinutes = input.days.reduce((sum, day) => sum + day.totalMinutes, 0)
  const overtimeCents = overtimeAmountCents(overtimeMinutes, rateCents)
  const exactTotalCents = baseCents + overtimeCents
  const issued = invoiceIdentity(input.year, input.month)
  return {
    year: input.year,
    month: input.month,
    businessDays,
    hoursPerBusinessDay: input.hoursPerBusinessDay,
    baseHours,
    hourlyCents,
    baseCents,
    overtimePercent: input.overtimePercent,
    overtimeRateCents: rateCents,
    overtimeMinutes,
    overtimeCents,
    exactTotalCents,
    invoiceCents: floorToDollar(exactTotalCents),
    invoiceId: issued.id,
    invoiceYear: issued.year,
    invoiceMonth: issued.month,
    invoiceDay: issued.day,
    periodEndDay: daysInMonth(input.year, input.month),
    days: input.days,
  }
}
