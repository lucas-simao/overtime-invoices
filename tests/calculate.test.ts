import { describe, expect, it } from 'vitest'
import { calculate } from '../src/core/calculate'
import { countBusinessDays, invoiceIdentity } from '../src/core/dates'
import { breakdownIntro, buildEmail, totalSentence } from '../src/core/documents'
import { dollarWords, formatDuration, formatMoney, overtimeAmountCents } from '../src/core/money'
import type { DayEntry, Profile } from '../src/core/types'

const profile: Profile = {
  issuer: {
    legalName: 'Northwind Studio Ltda.',
    addressLines: ['Rua Example, 100'],
    signName: 'Alex Rivera',
    shortName: 'Northwind Studio',
  },
  billTo: { name: 'Example Client', addressLines: ['100 Market St'] },
  serviceDescription: 'App development services',
  hourlyRate: 45,
  overtimePercent: 25,
  hoursPerBusinessDay: 8,
  recipientName: 'Jordan',
}

function day(month: number, minutes: number): DayEntry {
  return {
    day: 1,
    month,
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
    totalMinutes: minutes,
    tasks: ['Sample'],
  }
}

describe('business days', () => {
  it('counts Monday through Friday, including a weekday holiday', () => {
    expect(countBusinessDays(2026, 6)).toBe(22)
    expect(countBusinessDays(2026, 7)).toBe(23)
    expect(countBusinessDays(2026, 8)).toBe(21)
    expect(countBusinessDays(2026, 9)).toBe(22)
    expect(countBusinessDays(2026, 10)).toBe(22)
  })

  it('numbers the invoice as the first day of the next month', () => {
    expect(invoiceIdentity(2026, 9).id).toBe('20261001')
    expect(invoiceIdentity(2026, 10).id).toBe('20261101')
    expect(invoiceIdentity(2026, 12).id).toBe('20270101')
  })
})

describe('money', () => {
  it('spells whole dollars with and before the last part under one hundred', () => {
    expect(dollarWords(8173)).toBe('eight thousand one hundred and seventy-three')
    expect(dollarWords(2001)).toBe('two thousand and one')
    expect(dollarWords(2000)).toBe('two thousand')
  })

  it('rounds a half cent up and drops leftover cents from the invoice', () => {
    expect(overtimeAmountCents(1, 5625)).toBe(94)
    const calc = calculate({
      year: 2026,
      month: 10,
      hourlyRate: 45,
      overtimePercent: 25,
      hoursPerBusinessDay: 8,
      days: [day(10, 4 * 60 + 30)],
    })
    expect(formatMoney(calc.baseCents)).toBe('$7,920.00')
    expect(formatMoney(calc.overtimeRateCents)).toBe('$56.25')
    expect(formatDuration(calc.overtimeMinutes)).toBe('4:30')
    expect(formatMoney(calc.overtimeCents)).toBe('$253.13')
    expect(calc.exactTotalCents).toBe(817_313)
    expect(formatMoney(calc.invoiceCents)).toBe('$8,173.00')
    expect(calc.invoiceId).toBe('20261101')
    expect(totalSentence(calc)).toBe(
      'Total: $8173 (eight thousand one hundred and seventy-three dollars and zero cents)',
    )
  })
})

describe('email and breakdown', () => {
  it('writes the example email from the profile', () => {
    const calc = calculate({
      year: 2026,
      month: 10,
      hourlyRate: 45,
      overtimePercent: 25,
      hoursPerBusinessDay: 8,
      days: [day(10, 4 * 60 + 30)],
    })
    expect(buildEmail(profile, calc)).toBe(`Dear Jordan,

I hope you're doing well.

Please find attached Invoice #20261101 for October 2026, along with the Overtime Breakdown document detailing all overtime hours and the corresponding tasks completed during the month.

Invoice Summary
Base salary: $7,920.00
Overtime: $253.13 (4:30 hours)
Total invoice amount: $8,173.00

If you have any questions or need any additional information, please don't hesitate to reach out.

Thank you for your time and support.

Best regards,

Alex Rivera
Northwind Studio`)
    expect(breakdownIntro(calc)).toContain('4:30 hours of overtime worked during October 2026')
  })
})
