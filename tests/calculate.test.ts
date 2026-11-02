import { describe, expect, it } from 'vitest'
import { calculate } from '../src/core/calculate'
import {
  countBusinessDays,
  formatMonthPeriod,
  invoiceIdentity,
  invoiceNumberError,
  parseIsoDate,
  today,
  workDaysLabel,
} from '../src/core/dates'
import { isProfile, profileErrors } from '../src/core/profile'
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
  hourlyRate: 30,
  overtimePercent: 35,
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

  it('counts the work days a profile picks', () => {
    // October 2026 starts on a Thursday: 5 Thursdays, Fridays and Saturdays, 4 of every other day.
    expect(countBusinessDays(2026, 10, [1, 2, 3, 4, 5, 6])).toBe(27)
    expect(countBusinessDays(2026, 10, [2, 3, 4, 5, 6])).toBe(23)
    expect(countBusinessDays(2026, 10, [0, 6])).toBe(9)
    expect(countBusinessDays(2026, 10, [0, 1, 2, 3, 4, 5, 6])).toBe(31)
    expect(countBusinessDays(2026, 10, [])).toBe(0)
  })

  it('pays only the picked days in the base salary', () => {
    const input = { year: 2026, month: 10, hourlyRate: 30, overtimePercent: 35, hoursPerBusinessDay: 8, days: [day(10, 60)] }
    expect(calculate(input).baseCents).toBe(22 * 8 * 3000)
    const saturdays = calculate({ ...input, workDays: [6, 1, 2, 3, 4, 5, 1] })
    expect(saturdays.workDays).toEqual([1, 2, 3, 4, 5, 6])
    expect(saturdays.businessDays).toBe(27)
    expect(saturdays.baseCents).toBe(27 * 8 * 3000)
    // Overtime is only what the notes say, on any day.
    expect(saturdays.overtimeCents).toBe(calculate(input).overtimeCents)
  })

  it('writes the month as a period', () => {
    expect(formatMonthPeriod(2026, 10)).toBe('October 01\u201331, 2026')
    expect(formatMonthPeriod(2026, 2)).toBe('February 01\u201328, 2026')
    expect(formatMonthPeriod(2028, 2)).toBe('February 01\u201329, 2028')
  })

  it('names the work days', () => {
    expect(workDaysLabel([1, 2, 3, 4, 5])).toBe('Mon\u2013Fri')
    expect(workDaysLabel([1, 2, 3, 4, 5, 6])).toBe('Mon\u2013Sat')
    expect(workDaysLabel([6, 0])).toBe('Sat, Sun')
    expect(workDaysLabel([2, 4, 6])).toBe('Tue, Thu, Sat')
    expect(workDaysLabel([5, 6, 0])).toBe('Fri\u2013Sun')
    expect(workDaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('every day')
  })

  it('needs at least one work day and reads profiles saved before work days existed', () => {
    expect(profileErrors({ ...profile, workDays: [] })).toContain('Pick at least one work day.')
    expect(profileErrors({ ...profile, workDays: [1] })).toEqual([])
    expect(isProfile(profile)).toBe(true)
    expect(isProfile({ ...profile, workDays: [7] })).toBe(false)
  })

  it('numbers the invoice as the first day of the next month', () => {
    expect(invoiceIdentity(2026, 9).id).toBe('20261001')
    expect(invoiceIdentity(2026, 10).id).toBe('20261101')
    expect(invoiceIdentity(2026, 12).id).toBe('20270101')
  })
})

describe('money', () => {
  it('spells whole dollars with and before the last part under one hundred', () => {
    expect(dollarWords(5462)).toBe('five thousand four hundred and sixty-two')
    expect(dollarWords(2001)).toBe('two thousand and one')
    expect(dollarWords(2000)).toBe('two thousand')
  })

  it('rounds a half cent up and drops leftover cents from the invoice', () => {
    // One minute at $30.30 is 50.5 cents.
    expect(overtimeAmountCents(1, 3030)).toBe(51)
    const calc = calculate({
      year: 2026,
      month: 10,
      hourlyRate: 30,
      overtimePercent: 35,
      hoursPerBusinessDay: 8,
      days: [day(10, 4 * 60 + 30)],
    })
    expect(formatMoney(calc.baseCents)).toBe('$5,280.00')
    expect(formatMoney(calc.overtimeRateCents)).toBe('$40.50')
    expect(formatDuration(calc.overtimeMinutes)).toBe('4:30')
    expect(formatMoney(calc.overtimeCents)).toBe('$182.25')
    expect(calc.exactTotalCents).toBe(546_225)
    expect(formatMoney(calc.invoiceCents)).toBe('$5,462.00')
    expect(calc.invoiceId).toBe('20261101')
    expect(totalSentence(calc)).toBe(
      'Total: $5462 (five thousand four hundred and sixty-two dollars and zero cents)',
    )
  })
})

describe('email and breakdown', () => {
  it('writes the example email from the profile', () => {
    const calc = calculate({
      year: 2026,
      month: 10,
      hourlyRate: 30,
      overtimePercent: 35,
      hoursPerBusinessDay: 8,
      days: [day(10, 4 * 60 + 30)],
    })
    expect(buildEmail(profile, calc)).toBe(`Dear Jordan,

I hope you're doing well.

Please find attached Invoice #20261101 for October 2026, along with the Overtime Breakdown document detailing all overtime hours and the corresponding tasks completed during the month.

Invoice Summary
Base salary: $5,280.00
Overtime: $182.25 (4:30 hours)
Total invoice amount: $5,462.00

If you have any questions or need any additional information, please don't hesitate to reach out.

Thank you for your time and support.

Best regards,

Alex Rivera
Northwind Studio`)
    expect(breakdownIntro(calc)).toContain('4:30 hours of overtime worked during October 2026')
  })
})

describe('invoice date and number', () => {
  const base = { year: 2026, month: 10, hourlyRate: 30, overtimePercent: 35, hoursPerBusinessDay: 8, days: [day(10, 60)] }

  it('is dated today and numbered for the month by default', () => {
    const calc = calculate(base)
    const now = today()
    expect([calc.invoiceYear, calc.invoiceMonth, calc.invoiceDay]).toEqual([now.year, now.month, now.day])
    expect(calc.invoiceId).toBe('20261101')
  })

  it('takes a chosen date and number', () => {
    const calc = calculate({ ...base, issueDate: { year: 2026, month: 12, day: 5 }, invoiceNumber: ' INV-042 ' })
    expect([calc.invoiceYear, calc.invoiceMonth, calc.invoiceDay]).toEqual([2026, 12, 5])
    expect(calc.invoiceId).toBe('INV-042')
  })

  it('reads only real dates and safe numbers', () => {
    expect(parseIsoDate('2026-11-02')).toEqual({ year: 2026, month: 11, day: 2 })
    expect(parseIsoDate('2026-02-30')).toBe(null)
    expect(parseIsoDate('02/11/2026')).toBe(null)
    expect(invoiceNumberError('20261101')).toBe(undefined)
    expect(invoiceNumberError('')).toBe('Enter an invoice number.')
    expect(invoiceNumberError('a/b')).toBe('Use letters, digits, dots, dashes or underscores in the invoice number.')
  })
})
