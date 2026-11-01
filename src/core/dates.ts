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
