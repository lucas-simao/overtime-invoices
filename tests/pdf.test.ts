import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calculate } from '../src/core/calculate'
import { decodeLogo } from '../src/core/logo'
import { isLogo, isProfile } from '../src/core/profile'
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
  hourlyRate: 30,
  overtimePercent: 35,
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

function logo(name: string): string {
  const bytes = readFileSync(new URL(`../examples/logos/${name}.png`, import.meta.url))
  return `data:image/png;base64,${bytes.toString('base64')}`
}

describe('logos', () => {
  const calc = calculate({
    year: 2026,
    month: 10,
    hourlyRate: profile.hourlyRate,
    overtimePercent: profile.overtimePercent,
    hoursPerBusinessDay: profile.hoursPerBusinessDay,
    days: [{ day: 1, month: 10, hours: 1, minutes: 0, totalMinutes: 60, tasks: ['SOFT-1'] }],
  })

  it('puts both logos in the invoice and the company logo in the breakdown', async () => {
    const withLogos: Profile = {
      ...profile,
      issuer: { ...profile.issuer, logo: logo('northwind') },
      billTo: { ...profile.billTo, logo: logo('example-client') },
    }
    const plain = await renderInvoice(profile, calc)
    const invoice = await renderInvoice(withLogos, calc)
    const breakdown = await renderBreakdown(withLogos, calc)
    const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')
    // A transparent PNG becomes two images in a PDF: the picture and its mask.
    const images = (bytes: Uint8Array) => text(bytes).match(/\/Subtype \/Image/g)?.length ?? 0
    expect(images(breakdown)).toBeGreaterThan(0)
    expect(images(invoice)).toBe(images(breakdown) * 2)
    expect(text(plain).includes('/Subtype /Image')).toBe(false)
  })

  it('still makes the PDF when a logo cannot be read', async () => {
    const broken: Profile = { ...profile, issuer: { ...profile.issuer, logo: 'data:image/png;base64,AAAA' } }
    const invoice = await renderInvoice(broken, calc)
    expect(Buffer.from(invoice).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('accepts only PNG and JPEG data URLs as logos', () => {
    expect(isLogo(logo('northwind'))).toBe(true)
    expect(isLogo('data:image/svg+xml;base64,PHN2Zy8+')).toBe(false)
    expect(isLogo('https://example.com/logo.png')).toBe(false)
    expect(decodeLogo(logo('northwind'))?.kind).toBe('png')
    expect(isProfile({ ...profile, billTo: { ...profile.billTo, logo: 'not a logo' } })).toBe(false)
    expect(isProfile({ ...profile, issuer: { ...profile.issuer, logo: logo('northwind') } })).toBe(true)
  })
})
