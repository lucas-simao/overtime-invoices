import {
  type Color,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  setCharacterSpacing,
  StandardFonts,
} from 'pdf-lib'

/*
 * The PDFs follow the letter on the page (the `Letter` component in App.tsx):
 * the same structure, the same colors, the same type hierarchy. The page uses
 * IBM Plex; the PDFs use the fonts built into every PDF reader, mapped by role:
 * serif → Times, sans → Helvetica.
 */

function hex(value: string): Color {
  const n = Number.parseInt(value.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export const ink = hex('#17191E') // --paper-foreground
export const muted = hex('#4A505A') // --paper-muted
export const label = hex('#59606B') // --muted-foreground, used by PaperLabel
export const hairline = hex('#E2E0DA') // --paper-line

export type Fonts = {
  serif: PDFFont
  serifBold: PDFFont
  serifItalic: PDFFont
  sans: PDFFont
  sansBold: PDFFont
}

export async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  const [serif, serifBold, serifItalic, sans, sansBold] = await Promise.all([
    doc.embedFont(StandardFonts.TimesRoman),
    doc.embedFont(StandardFonts.TimesRomanBold),
    doc.embedFont(StandardFonts.TimesRomanItalic),
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ])
  return { serif, serifBold, serifItalic, sans, sansBold }
}

const characterSets = new WeakMap<PDFFont, Set<number>>()

/** Normalizes punctuation and drops characters the font cannot encode, so drawing never throws. */
export function pdfSafe(text: string, font?: PDFFont): string {
  const normalized = text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ')
  if (!font) return normalized
  let set = characterSets.get(font)
  if (!set) {
    set = new Set(font.getCharacterSet())
    characterSets.set(font, set)
  }
  let out = ''
  for (const char of normalized) out += set.has(char.codePointAt(0) ?? 0) ? char : '?'
  return out
}

export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = pdfSafe(text, font).split(' ').filter(Boolean)
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

export type TextStyle = { font: PDFFont; size: number; color?: Color; tracking?: number }

export function textWidth(text: string, style: TextStyle): number {
  const safe = pdfSafe(text, style.font)
  const tracking = style.tracking ?? 0
  return style.font.widthOfTextAtSize(safe, style.size) + tracking * Math.max(0, [...safe].length - 1)
}

export function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
  align: 'left' | 'right' = 'left',
): void {
  const safe = pdfSafe(text, style.font)
  const left = align === 'right' ? x - textWidth(safe, style) : x
  if (style.tracking) page.pushOperators(setCharacterSpacing(style.tracking))
  page.drawText(safe, { x: left, y, font: style.font, size: style.size, color: style.color ?? ink })
  if (style.tracking) page.pushOperators(setCharacterSpacing(0))
}

export function drawRule(
  page: PDFPage,
  x1: number,
  x2: number,
  y: number,
  color: Color = hairline,
  thickness = 0.75,
): void {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color })
}

/** The small uppercase, letter-spaced label the page uses for "Invoice", "Bill to", "Total due". */
export function labelStyle(fonts: Fonts): TextStyle {
  return { font: fonts.sansBold, size: 7, color: label, tracking: 0.9 }
}

export function drawLabel(
  page: PDFPage,
  fonts: Fonts,
  text: string,
  x: number,
  y: number,
  align: 'left' | 'right' = 'left',
): void {
  drawText(page, text.toUpperCase(), x, y, labelStyle(fonts), align)
}

/** Draws wrapped lines top-down from `y` (a baseline) and returns the baseline after the last line. */
export function drawLines(
  page: PDFPage,
  lines: string[],
  x: number,
  y: number,
  style: TextStyle,
  leading: number,
  align: 'left' | 'right' = 'left',
): number {
  let baseline = y
  for (const line of lines) {
    drawText(page, line, x, baseline, style, align)
    baseline -= leading
  }
  return baseline
}

/** A small arrow, like the "→" in the page's day count line (it is not in the built-in fonts). */
export function drawArrow(page: PDFPage, x: number, y: number, width: number, color: Color): void {
  const mid = y + 2.6
  page.drawLine({ start: { x, y: mid }, end: { x: x + width, y: mid }, thickness: 0.7, color })
  page.drawLine({ start: { x: x + width - 2.6, y: mid + 2.2 }, end: { x: x + width, y: mid }, thickness: 0.7, color })
  page.drawLine({ start: { x: x + width - 2.6, y: mid - 2.2 }, end: { x: x + width, y: mid }, thickness: 0.7, color })
}

export type Header = {
  issuerName: string
  issuerAddress: string[]
  kind: string
  id: string
  date: string
}

/**
 * The letterhead: issuer on the left, document kind, number and date on the
 * right, then a hairline. Returns the y below the hairline.
 */
export function drawLetterhead(
  page: PDFPage,
  fonts: Fonts,
  header: Header,
  left: number,
  right: number,
  top: number,
): number {
  const rightWidth = 170
  const leftWidth = right - left - rightWidth - 24

  let y = top - 18
  const nameStyle: TextStyle = { font: fonts.serifBold, size: 18 }
  y = drawLines(page, wrapText(header.issuerName, nameStyle.font, nameStyle.size, leftWidth), left, y, nameStyle, 22)
  y -= 2
  const addressStyle: TextStyle = { font: fonts.sans, size: 9.5, color: muted }
  for (const line of header.issuerAddress) {
    y = drawLines(page, wrapText(line, addressStyle.font, addressStyle.size, leftWidth), left, y, addressStyle, 14)
  }
  const leftBottom = y + 14

  let r = top - 7
  drawLabel(page, fonts, header.kind, right, r, 'right')
  r -= 21
  drawText(page, header.id, right, r, { font: fonts.sansBold, size: 14, tracking: 0.3 }, 'right')
  r -= 18
  drawText(page, header.date, right, r, { font: fonts.serif, size: 11.5 }, 'right')

  const bottom = Math.min(leftBottom, r) - 26
  drawRule(page, left, right, bottom)
  return bottom
}

export type Signature = { name: string; company: string }

/** The signature block: a dark line, the name, then the company in small sans. */
export function drawSignature(
  page: PDFPage,
  fonts: Fonts,
  signature: Signature,
  x: number,
  y: number,
): number {
  drawRule(page, x, x + 190, y, ink, 0.75)
  let baseline = y - 18
  drawText(page, signature.name, x, baseline, { font: fonts.serif, size: 12 })
  baseline -= 14
  if (signature.company) {
    drawText(page, signature.company, x, baseline, { font: fonts.sans, size: 9.5, color: muted })
  }
  return baseline
}
