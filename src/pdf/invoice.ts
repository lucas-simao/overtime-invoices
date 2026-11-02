import { PDFDocument } from 'pdf-lib'
import { MONTHS } from '../core/dates'
import { invoiceIssueDate, overtimeDaysLabel } from '../core/documents'
import { formatDuration, formatMoney, invoiceAmountWords } from '../core/money'
import type { Calculation, Profile } from '../core/types'
import {
  drawArrow,
  drawLabel,
  drawLetterhead,
  drawLines,
  drawRule,
  drawSignature,
  drawText,
  drawLogo,
  embedFonts,
  embedLogo,
  ink,
  muted,
  type TextStyle,
  textWidth,
  wrapText,
} from './layout'

// US Letter, laid out like the letter on the page.
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const LEFT = 64
const RIGHT = PAGE_WIDTH - 64
const TOP = PAGE_HEIGHT - 64

function filled(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean)
}

export async function renderInvoice(profile: Profile, calc: Calculation): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Invoice ${calc.invoiceId}`)
  doc.setAuthor(profile.issuer.signName.trim())
  doc.setCreator('overtime-invoices')
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const fonts = await embedFonts(doc)
  const [issuerLogo, clientLogo] = await Promise.all([
    embedLogo(doc, profile.issuer.logo),
    embedLogo(doc, profile.billTo.logo),
  ])
  const period = `${MONTHS[calc.month - 1]} ${calc.year}`

  let y = drawLetterhead(
    page,
    fonts,
    {
      logo: issuerLogo,
      issuerName: profile.issuer.legalName.trim(),
      issuerAddress: filled(profile.issuer.addressLines),
      kind: 'Invoice',
      id: calc.invoiceId,
      date: invoiceIssueDate(calc),
    },
    LEFT,
    RIGHT,
    TOP,
  )

  // Bill to | Service
  const columnGap = 24
  const columnWidth = (RIGHT - LEFT - columnGap) / 2
  const secondColumn = LEFT + columnWidth + columnGap
  const valueStyle: TextStyle = { font: fonts.serif, size: 12.5 }
  const detailStyle: TextStyle = { font: fonts.sans, size: 9.5, color: muted }
  const top = y - 28
  drawLabel(page, fonts, 'Bill to', LEFT, top)
  drawLabel(page, fonts, 'Service', secondColumn, top)

  let leftY = top - 19
  if (clientLogo) leftY -= drawLogo(page, clientLogo, LEFT, top - 10, Math.min(columnWidth, 130), 30) + 6
  leftY = drawLines(
    page,
    wrapText(profile.billTo.name.trim(), valueStyle.font, valueStyle.size, columnWidth),
    LEFT,
    leftY,
    valueStyle,
    16,
  )
  leftY -= 1
  for (const line of filled(profile.billTo.addressLines)) {
    leftY = drawLines(page, wrapText(line, detailStyle.font, detailStyle.size, columnWidth), LEFT, leftY, detailStyle, 14)
  }

  let rightY = top - 19
  rightY = drawLines(
    page,
    wrapText(profile.serviceDescription.trim(), valueStyle.font, valueStyle.size, columnWidth),
    secondColumn,
    rightY,
    valueStyle,
    16,
  )
  rightY -= 1
  rightY = drawLines(page, [period], secondColumn, rightY, detailStyle, 14)

  // Total due: dark rule above, hairline below.
  y = Math.min(leftY, rightY) - 22
  drawRule(page, LEFT, RIGHT, y, ink, 0.9)
  y -= 26
  drawLabel(page, fonts, 'Total due', LEFT, y)
  y -= 42
  drawText(page, formatMoney(calc.invoiceCents), LEFT, y, { font: fonts.serif, size: 42, tracking: -0.6 })
  y -= 24
  y = drawLines(
    page,
    wrapText(invoiceAmountWords(calc.invoiceCents), fonts.serifItalic, 12.5, RIGHT - LEFT),
    LEFT,
    y,
    { font: fonts.serifItalic, size: 12.5, color: muted },
    16,
  )
  y -= 8
  drawRule(page, LEFT, RIGHT, y)

  // Line items
  const rowStyle: TextStyle = { font: fonts.serif, size: 12.5 }
  const amountStyle: TextStyle = { font: fonts.sans, size: 10.5 }
  y -= 34
  drawText(page, 'Base salary', LEFT, y, rowStyle)
  drawText(page, formatMoney(calc.baseCents), RIGHT, y, amountStyle, 'right')
  y -= 13
  drawRule(page, LEFT, RIGHT, y)

  y -= 23
  const overtimeParts: [string, TextStyle][] = [
    ['Overtime ', rowStyle],
    [formatDuration(calc.overtimeMinutes), amountStyle],
    [' at ', rowStyle],
    [formatMoney(calc.overtimeRateCents), amountStyle],
  ]
  let x = LEFT
  for (const [text, style] of overtimeParts) {
    drawText(page, text, x, y, style)
    x += textWidth(text, style)
  }
  drawText(page, formatMoney(calc.overtimeCents), RIGHT, y, amountStyle, 'right')
  y -= 13
  drawRule(page, LEFT, RIGHT, y)

  y -= 25
  drawText(page, 'Total', LEFT, y, { font: fonts.serifBold, size: 12.5 })
  drawText(page, formatMoney(calc.invoiceCents), RIGHT, y, { font: fonts.sansBold, size: 11 }, 'right')

  // "3 days with overtime in October 2026 → 7:20"
  y -= 32
  const countStyle: TextStyle = { font: fonts.sans, size: 9.5, color: muted }
  const count = `${overtimeDaysLabel(calc.days.length)} in ${period}`
  drawText(page, count, LEFT, y, countStyle)
  x = LEFT + textWidth(count, countStyle) + 5
  drawArrow(page, x, y, 10, muted)
  drawText(page, formatDuration(calc.overtimeMinutes), x + 15, y, countStyle)

  y -= 64
  drawSignature(
    page,
    fonts,
    { name: profile.issuer.signName.trim(), company: profile.issuer.legalName.trim() },
    LEFT,
    y,
  )

  return doc.save()
}
