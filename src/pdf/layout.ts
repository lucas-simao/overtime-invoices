import type { PDFFont, PDFPage } from 'pdf-lib'
import { rgb } from 'pdf-lib'

export const ink = rgb(0, 0, 0)

export function pdfSafe(text: string): string {
  return text.replace(/\u2013|\u2014/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
}

export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= width) current = next
    else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

export function drawCentered(
  page: PDFPage,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
): void {
  const safe = pdfSafe(text)
  const width = font.widthOfTextAtSize(safe, size)
  page.drawText(safe, {
    x: (page.getWidth() - width) / 2,
    y,
    font,
    size,
    color: ink,
  })
}
