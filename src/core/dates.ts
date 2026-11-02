export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function countBusinessDays(year: number, month: number): number {
  const last = daysInMonth(year, month)
  let count = 0
  for (let day = 1; day <= last; day += 1) {
    const weekday = new Date(year, month - 1, day).getDay()
    if (weekday !== 0 && weekday !== 6) count += 1
  }
  return count
}

export function invoiceIdentity(year: number, month: number): {
  year: number
  month: number
  day: number
  id: string
} {
  const issued = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  const id = `${issued.year}${String(issued.month).padStart(2, '0')}01`
  return { year: issued.year, month: issued.month, day: 1, id }
}

export type CalendarDate = { year: number; month: number; day: number }

/** Today on this computer's calendar (not UTC), so an invoice made at night keeps today's date. */
export function today(now = new Date()): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

export function toIsoDate(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

/** Reads YYYY-MM-DD. Returns null for anything that is not a real calendar date. */
export function parseIsoDate(text: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim())
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

/** Invoice numbers end up in file names, so they keep to letters, digits, dot, dash and underscore. */
export function invoiceNumberError(text: string): string | undefined {
  const value = text.trim()
  if (!value) return 'Enter an invoice number.'
  if (value.length > 40) return 'Keep the invoice number under 40 characters.'
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    return 'Use letters, digits, dots, dashes or underscores in the invoice number.'
  }
  return undefined
}

export function formatLongDate(year: number, month: number, day: number): string {
  return `${MONTHS[month - 1]} ${String(day).padStart(2, '0')}, ${year}`
}

export function formatMonthDay(month: number, day: number): string {
  return `${MONTHS[month - 1]} ${String(day).padStart(2, '0')}`
}

export function previousMonth(from = new Date()): { year: number; month: number } {
  const date = new Date(from.getFullYear(), from.getMonth() - 1, 1)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}
