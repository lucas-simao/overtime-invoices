import { PDFDocument, type PDFFont, type PDFPage, StandardFonts } from 'pdf-lib'
import { buildBreakdown } from '../core/documents'
import type { Calculation, Profile } from '../core/types'
import { drawCentered, ink, wrapText } from './layout'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 56.7
const TOP = 64
const BOTTOM = 56

export async function renderBreakdown(profile: Profile, calc: Calculation): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Overtime breakdown ${calc.invoiceId}`)
  doc.setAuthor(profile.issuer.signName.trim())
  doc.setCreator('overtime-invoices')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const cursor: { page: PDFPage; y: number } = {
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - TOP,
  }

  const ensure = (height: number) => {
    if (cursor.y - height < BOTTOM) {
      cursor.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      cursor.y = PAGE_HEIGHT - TOP
    }
  }
  const writeLine = (text: string, x: number, face: PDFFont, size: number) => {
    ensure(size + 4)
    cursor.page.drawText(text, { x, y: cursor.y, font: face, size, color: ink })
    cursor.y -= size + 4
  }

  const width = PAGE_WIDTH - MARGIN_X * 2
  let previous = ''
  for (const block of buildBreakdown(profile, calc)) {
    if (block.type === 'paragraph' && previous === 'bullet') cursor.y -= 12
    if (block.type === 'title') {
      ensure(22)
      drawCentered(cursor.page, block.text, cursor.y, bold, 16)
      cursor.y -= 22
      previous = block.type
      continue
    }
    if (block.type === 'date') {
      ensure(18)
      drawCentered(cursor.page, block.text, cursor.y, font, 12)
      cursor.y -= 30
      previous = block.type
      continue
    }
    if (block.type === 'heading') {
      cursor.y -= 8
      for (const line of wrapText(block.text, bold, 12, width)) writeLine(line, MARGIN_X, bold, 12)
      cursor.y -= 2
      previous = block.type
      continue
    }
    if (block.type === 'bullet') {
      const lines = wrapText(block.text, font, 11, width - 18)
      lines.forEach((line, index) => {
        ensure(15)
        if (index === 0) {
          cursor.page.drawCircle({ x: MARGIN_X + 3, y: cursor.y + 3, size: 1.4, color: ink })
        }
        cursor.page.drawText(line, { x: MARGIN_X + 14, y: cursor.y, font, size: 11, color: ink })
        cursor.y -= 15
      })
      cursor.y -= 1
      previous = block.type
      continue
    }
    for (const line of wrapText(block.text, font, 11, width)) writeLine(line, MARGIN_X, font, 11)
    cursor.y -= 12
    previous = block.type
  }

  return doc.save()
}
