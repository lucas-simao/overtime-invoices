import { describe, expect, it } from 'vitest'
import { calculate } from '../src/core/calculate'
import type { DayEntry, Profile } from '../src/core/types'
import { renderBreakdown } from '../src/pdf/breakdown'
import { renderInvoice } from '../src/pdf/invoice'

const profile: Profile = {
  issuer: {
    legalName: 'Northwind Studio Ltda.',
    addressLines: ['Rua Example, 100', 'Sala 1'],
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

describe('pdf', () => {
  it('builds an invoice and a breakdown that can run past one page', async () => {
    const days: DayEntry[] = Array.from({ length: 20 }, (_, index) => ({
      day: index + 1,
      month: 9,
      hours: 2,
      minutes: 15,
      totalMinutes: 135,
      tasks: Array.from({ length: 8 }, (__, task) => `SOFT-${2000 + index * 10 + task}`),
    }))
    const calc = calculate({
      year: 2026,
      month: 9,
      hourlyRate: profile.hourlyRate,
      overtimePercent: profile.overtimePercent,
      hoursPerBusinessDay: profile.hoursPerBusinessDay,
      days,
    })
    const invoice = await renderInvoice(profile, calc)
    const breakdown = await renderBreakdown(profile, calc)
    expect(Buffer.from(invoice).subarray(0, 5).toString()).toBe('%PDF-')
    expect(Buffer.from(breakdown).subarray(0, 5).toString()).toBe('%PDF-')
    expect(breakdown.byteLength).toBeGreaterThan(invoice.byteLength)
  })
})
