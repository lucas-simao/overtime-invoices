import { PDFDocument, type PDFPage } from 'pdf-lib'
import { formatLongDate, formatMonthDay, MONTHS, MONTHS_SHORT } from '../core/dates'
import { breakdownClosing, breakdownIntro, overtimeDaysLabel } from '../core/documents'
import { formatDuration, formatMoney, formatPercent } from '../core/money'
import type { Calculation, Profile } from '../core/types'
import {
  drawLabel,
  drawLetterhead,
  drawLines,
  drawRule,
  drawSignature,
  drawText,
  embedFonts,
  embedLogo,
  type Fonts,
  ink,
  label,
  muted,
  type TextStyle,
  textWidth,
  wrapText,
} from './layout'

// A4, in the same visual language as the invoice.
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const LEFT = 60
const RIGHT = PAGE_WIDTH - 60
const TOP = PAGE_HEIGHT - 52
const BOTTOM = 44

// Columns of the day table.
const DATE_WIDTH = 92
const HOURS_WIDTH = 56
const TASKS_X = LEFT + DATE_WIDTH
const TASKS_WIDTH = RIGHT - HOURS_WIDTH - TASKS_X - 16

const DASH = '–'

function filled(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean)
}

export async function renderBreakdown(profile: Profile, calc: Calculation): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Overtime breakdown ${calc.invoiceId}`)
  doc.setAuthor(profile.issuer.signName.trim())
  doc.setCreator('overtime-invoices')
  const fonts = await embedFonts(doc)
  const issuerLogo = await embedLogo(doc, profile.issuer.logo)

  const body: TextStyle = { font: fonts.serif, size: 12 }
  const row: TextStyle = { font: fonts.serif, size: 12 }
  const amount: TextStyle = { font: fonts.sans, size: 10.5 }
  const detail: TextStyle = { font: fonts.sans, size: 9.5, color: muted }
  const month = MONTHS[calc.month - 1]
  const short = MONTHS_SHORT[calc.month - 1]

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = drawLetterhead(
    page,
    fonts,
    {
      logo: issuerLogo,
      issuerName: profile.issuer.legalName.trim(),
      issuerAddress: filled(profile.issuer.addressLines),
      kind: 'Overtime breakdown',
      id: calc.invoiceId,
      date: formatLongDate(calc.year, calc.month, 1),
    },
    LEFT,
    RIGHT,
    TOP,
    { compact: true },
  )

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = TOP
  }
  /** Starts a new page when the next `height` points do not fit. Returns true if it did. */
  const ensure = (height: number): boolean => {
    if (y - height >= BOTTOM) return false
    newPage()
    return true
  }

  const section = (title: string, aside?: string) => {
    ensure(60)
    y -= 24
    drawLabel(page, fonts, title, LEFT, y)
    if (aside) drawText(page, aside, RIGHT, y, detail, 'right')
    y -= 9
    drawRule(page, LEFT, RIGHT, y, ink, 0.9)
  }
  /** A ruled row: text on the left, a figure on the right. */
  const line = (text: string, figure: string, options: { strong?: boolean; last?: boolean } = {}) => {
    ensure(26)
    y -= 18
    drawText(page, text, LEFT, y, options.strong ? { ...row, font: fonts.serifBold } : row)
    drawText(page, figure, RIGHT, y, options.strong ? { ...amount, font: fonts.sansBold, size: 11 } : amount, 'right')
    y -= 9
    if (!options.last) drawRule(page, LEFT, RIGHT, y)
  }

  // Intro
  y -= 26
  y = drawLines(page, wrapText(breakdownIntro(calc), body.font, body.size, RIGHT - LEFT), LEFT, y, body, 17) + 17

  // Base salary
  section('Base salary', `${short} 01${DASH}${String(calc.periodEndDay).padStart(2, '0')}`)
  line(`${calc.businessDays} business days × ${calc.hoursPerBusinessDay} hours`, `${calc.baseHours} hours`)
  line('Hourly rate', formatMoney(calc.hourlyCents))
  line('Subtotal', formatMoney(calc.baseCents), { strong: true, last: true })

  // Overtime by day
  const dayHeader = () => {
    y -= 17
    drawText(page, 'DATE', LEFT, y, { font: fonts.sansBold, size: 7, color: label, tracking: 0.9 })
    drawText(page, 'TASKS', TASKS_X, y, { font: fonts.sansBold, size: 7, color: label, tracking: 0.9 })
    drawText(page, 'HOURS', RIGHT, y, { font: fonts.sansBold, size: 7, color: label, tracking: 0.9 }, 'right')
    y -= 8
    drawRule(page, LEFT, RIGHT, y)
  }
  section(`Overtime by day ${DASH} ${month} ${calc.year}`)
  dayHeader()
  const taskStyle: TextStyle = { font: fonts.sans, size: 9.5, color: muted }
  calc.days.forEach((day, index) => {
    const tasks = day.tasks.length ? wrapText(day.tasks.join(', '), taskStyle.font, taskStyle.size, TASKS_WIDTH) : []
    const height = 17 + Math.max(0, tasks.length - 1) * 13 + 8
    if (ensure(height + 2)) {
      drawLabel(page, fonts, `Overtime by day ${DASH} ${month} ${calc.year} (continued)`, LEFT, y - 7)
      y -= 7
      dayHeader()
    }
    y -= 17
    drawText(page, formatMonthDay(calc.month, day.day).replace(month, short), LEFT, y, row)
    drawText(page, formatDuration(day.totalMinutes), RIGHT, y, amount, 'right')
    if (tasks.length) y = drawLines(page, tasks, TASKS_X, y + 0.5, taskStyle, 13) + 13
    else drawText(page, DASH, TASKS_X, y, taskStyle)
    y -= 8
    if (index < calc.days.length - 1) drawRule(page, LEFT, RIGHT, y)
  })
  ensure(30)
  drawRule(page, LEFT, RIGHT, y, ink, 0.9)
  y -= 18
  const daysLabel = overtimeDaysLabel(calc.days.length)
  drawText(page, 'Total overtime', LEFT, y, { ...row, font: fonts.serifBold })
  drawText(page, daysLabel, TASKS_X, y, taskStyle)
  drawText(page, formatDuration(calc.overtimeMinutes), RIGHT, y, { ...amount, font: fonts.sansBold, size: 11 }, 'right')
  y -= 11

  // Overtime
  section('Overtime')
  line('Base rate', `${formatMoney(calc.hourlyCents)}/hour`)
  line(`Overtime rate (+${formatPercent(calc.overtimePercent)})`, `${formatMoney(calc.overtimeRateCents)}/hour`)
  line(
    `${formatDuration(calc.overtimeMinutes)} hours × ${formatMoney(calc.overtimeRateCents)}`,
    formatMoney(calc.overtimeCents),
    { strong: true, last: true },
  )

  // The closing goes on the same page as the total, so the signature never sits alone.
  const closing = breakdownClosing()
  const closingLines = closing.flatMap((paragraph) => wrapText(paragraph, body.font, body.size, RIGHT - LEFT))
  const closingHeight = 20 + closingLines.length * 16 + 24 + 32

  // Invoice total, in the same shape as the invoice's "Total due": base + overtime.
  ensure(73 + closingHeight)
  y -= 24
  drawLabel(page, fonts, 'Invoice total', LEFT, y)
  y -= 9
  drawRule(page, LEFT, RIGHT, y, ink, 0.9)
  y -= 26
  drawText(
    page,
    `${formatMoney(calc.baseCents)} base salary + ${formatMoney(calc.overtimeCents)} overtime`,
    LEFT,
    y,
    { font: fonts.serif, size: 12, color: muted },
  )
  drawText(page, formatMoney(calc.invoiceCents), RIGHT, y - 2, { font: fonts.serif, size: 26, tracking: -0.3 }, 'right')
  y -= 14
  drawRule(page, LEFT, RIGHT, y)

  // Closing and signature
  y -= 20
  for (const paragraph of closing) {
    y = drawLines(page, wrapText(paragraph, body.font, body.size, RIGHT - LEFT), LEFT, y, body, 16)
  }
  y -= 24
  drawSignature(
    page,
    fonts,
    { name: profile.issuer.signName.trim(), company: profile.issuer.legalName.trim() },
    LEFT,
    y,
  )

  drawPageNumbers(doc, fonts, calc.invoiceId)
  return doc.save()
}

function drawPageNumbers(doc: PDFDocument, fonts: Fonts, invoiceId: string): void {
  const pages = doc.getPages()
  if (pages.length < 2) return
  const style: TextStyle = { font: fonts.sans, size: 8.5, color: muted }
  pages.forEach((page, index) => {
    const text = `Overtime breakdown ${invoiceId}  ·  ${index + 1} of ${pages.length}`
    drawText(page, text, (PAGE_WIDTH + textWidth(text, style)) / 2, 26, style, 'right')
  })
}
