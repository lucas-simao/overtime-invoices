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

/** Monday to Friday, in Date.getDay() numbers (0 = Sunday). */
export const WEEKDAYS = [1, 2, 3, 4, 5]

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Sorted, unique, 0–6. Falls back to Monday to Friday when nothing usable is given. */
export function normalizeWorkDays(days: readonly number[] | undefined): number[] {
  if (!days) return [...WEEKDAYS]
  return [...new Set(days)].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).sort((a, b) => a - b)
}

/** The days in the month that fall on a work day: the business days of the base salary. */
export function countBusinessDays(year: number, month: number, workDays: readonly number[] = WEEKDAYS): number {
  const last = daysInMonth(year, month)
  let count = 0
  for (let day = 1; day <= last; day += 1) {
    if (workDays.includes(new Date(year, month - 1, day).getDay())) count += 1
  }
  return count
}

/** "Mon–Fri", "Mon–Sat", "Sat–Sun", "Tue, Thu, Sat", "every day". Weeks start on Monday. */
export function workDaysLabel(workDays: readonly number[]): string {
  const days = normalizeWorkDays(workDays)
  if (days.length === 7) return 'every day'
  const order = [1, 2, 3, 4, 5, 6, 0]
  const positions = days.map((day) => order.indexOf(day)).sort((a, b) => a - b)
  const consecutive = positions.every((position, index) => index === 0 || position === positions[index - 1] + 1)
  const names = positions.map((position) => DAY_NAMES_SHORT[order[position]])
  if (consecutive && names.length >= 3) return `${names[0]}\u2013${names[names.length - 1]}`
  return names.join(', ')
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

/** The whole month as a period: "October 01–31, 2026". */
export function formatMonthPeriod(year: number, month: number): string {
  return `${MONTHS[month - 1]} 01\u2013${String(daysInMonth(year, month)).padStart(2, '0')}, ${year}`
}

export function formatMonthDay(month: number, day: number): string {
  return `${MONTHS[month - 1]} ${String(day).padStart(2, '0')}`
}

export function previousMonth(from = new Date()): { year: number; month: number } {
  const date = new Date(from.getFullYear(), from.getMonth() - 1, 1)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}
