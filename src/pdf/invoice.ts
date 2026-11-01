import { PDFDocument, StandardFonts } from 'pdf-lib'
import { invoiceIssueDate, invoiceTitle, periodLine, totalSentence } from '../core/documents'
import { formatAmount } from '../core/money'
import type { Calculation, Profile } from '../core/types'
import { drawCentered, ink, pdfSafe, wrapText } from './layout'

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const LEFT = 72
const RIGHT = 540

function filled(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean)
}

export async function renderInvoice(profile: Profile, calc: Calculation): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Invoice ${calc.invoiceId}`)
  doc.setAuthor(profile.issuer.signName.trim())
  doc.setCreator('overtime-invoices')
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  drawCentered(page, invoiceTitle(calc), 706, bold, 16)
  drawCentered(page, invoiceIssueDate(calc), 686, font, 12)

  const left = filled([profile.issuer.legalName, ...profile.issuer.addressLines])
  const right = filled(['Bill to:', profile.billTo.name, ...profile.billTo.addressLines])
  const leftBottom = drawBlock(page, left, LEFT, 638, 210, font, bold)
  const rightBottom = drawBlock(page, right, 306, 638, 234, font, bold)
  let y = Math.min(leftBottom, rightBottom) - 34

  page.drawText('Description', { x: LEFT, y, font: bold, size: 12, color: ink })
  const totalLabel = 'Total'
  page.drawText(totalLabel, {
    x: RIGHT - bold.widthOfTextAtSize(totalLabel, 12),
    y,
    font: bold,
    size: 12,
    color: ink,
  })
  page.drawLine({
    start: { x: LEFT, y: y - 6 },
    end: { x: RIGHT, y: y - 6 },
    thickness: 0.8,
    color: ink,
  })

  y -= 26
  const description = pdfSafe(profile.serviceDescription.trim())
  const amount = formatAmount(calc.invoiceCents)
  page.drawText(description, { x: LEFT, y, font, size: 11, color: ink })
  page.drawText(amount, {
    x: RIGHT - font.widthOfTextAtSize(amount, 11),
    y,
    font,
    size: 11,
    color: ink,
  })

  y -= 16
  page.drawText(pdfSafe(periodLine(calc)), { x: LEFT, y, font, size: 10, color: ink })

  y -= 26
  for (const line of wrapText(totalSentence(calc), font, 11, RIGHT - LEFT)) {
    page.drawText(line, { x: LEFT, y, font, size: 11, color: ink })
    y -= 15
  }

  y -= 64
  const signature = 'Signature:'
  page.drawText(signature, { x: LEFT, y, font, size: 11, color: ink })
  const signatureWidth = font.widthOfTextAtSize(signature, 11)
  page.drawLine({
    start: { x: LEFT + signatureWidth + 10, y: y - 1 },
    end: { x: LEFT + signatureWidth + 190, y: y - 1 },
    thickness: 0.7,
    color: ink,
  })
  y -= 20
  page.drawText(pdfSafe(profile.issuer.signName.trim()), {
    x: LEFT + signatureWidth + 10,
    y,
    font,
    size: 11,
    color: ink,
  })

  return doc.save()
}

function drawBlock(
  page: ReturnType<PDFDocument['addPage']>,
  lines: string[],
  x: number,
  startY: number,
  width: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
): number {
  let y = startY
  lines.forEach((line, index) => {
    const face = index === 0 ? bold : font
    for (const wrapped of wrapText(line, face, 11, width)) {
      page.drawText(wrapped, { x, y, font: face, size: 11, color: ink })
      y -= 14
    }
  })
  return y
}
