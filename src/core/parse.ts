import { daysInMonth } from './dates'
import { type DateRead, readDate, readTime, remainder } from './read-time'
import type { DayEntry } from './types'

export function normalizeNotes(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\(edited\)/gi, '')
    .replace(/Sent using @\S+/gi, '')
    .replace(/^.*\[\d{1,2}:\d{2}\s*[AP]M\].*$/gim, '')
    // Slack copies can run several messages together on one line.
    .replace(/(\S)[ \t]*(?=Horas Extras dia\b)/gi, '$1\n')
}

/**
 * A leading uppercase token is a project prefix when a bare number belongs to it,
 * or when it only introduces another prefix ("SOFT PUBLIC FORM ...").
 * Later uppercase words stay as text unless a bare number follows them.
 */
function isProjectTag(token: string): boolean {
  return /^[A-Z][A-Z0-9]{1,7}$/.test(token)
}

function isExplicitCode(token: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*-\d+(?:-[A-Za-z0-9]+)*$/.test(token)
}

function normalizeCode(token: string): string {
  return token.replace(/^[A-Za-z][A-Za-z0-9]*/, (prefix) => prefix.toUpperCase())
}

function nextMeaningful(tokens: string[], start: number): string | undefined {
  for (let index = start; index < tokens.length; index += 1) {
    if (!tokens[index].startsWith('(')) return tokens[index]
  }
  return undefined
}

function isPrefixAt(tokens: string[], index: number): boolean {
  const token = tokens[index]
  if (!isProjectTag(token)) return false
  const next = nextMeaningful(tokens, index + 1)
  if (next && /^\d+$/.test(next)) return true
  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    const candidate = tokens[cursor]
    if (candidate.startsWith('(')) continue
    if (/^\d+$/.test(candidate)) return true
    if (isExplicitCode(candidate) || isProjectTag(candidate)) break
  }
  return index === 0 && !!next && (isProjectTag(next) || isExplicitCode(next))
}

export function tokenizeTasks(text: string): string[] {
  const source = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  const tokens: string[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (/[\s,;]/.test(char) || char === '—' || char === '–' || char === '/') {
      index += 1
      continue
    }
    if (char === '"') {
      const end = source.indexOf('"', index + 1)
      if (end === -1) {
        tokens.push(source.slice(index))
        break
      }
      tokens.push(source.slice(index, end + 1))
      index = end + 1
      continue
    }
    if (char === '(') {
      const end = source.indexOf(')', index + 1)
      if (end === -1) {
        tokens.push(source.slice(index))
        break
      }
      tokens.push(source.slice(index, end + 1))
      index = end + 1
      continue
    }
    let end = index
    while (
      end < source.length &&
      !/[\s,;]/.test(source[end]) &&
      source[end] !== '(' &&
      source[end] !== '"'
    ) {
      end += 1
    }
    const token = source.slice(index, end).replace(/^[—–-]+/, '')
    if (token) tokens.push(token)
    index = end
  }
  return tokens
}

export function tasksFromText(text: string): string[] {
  const tokens = tokenizeTasks(text)
  const tasks: string[] = []
  const seenCodes = new Set<string>()
  let prefix: string | null = null
  let words: string[] = []

  const flushWords = () => {
    if (words.length === 0) return
    tasks.push(words.join(' '))
    words = []
  }

  const addCode = (code: string) => {
    flushWords()
    if (seenCodes.has(code)) return
    seenCodes.add(code)
    tasks.push(code)
  }

  tokens.forEach((token, index) => {
    if (token.startsWith('(')) {
      if (words.length > 0) words.push(token)
      else if (tasks.length > 0) tasks[tasks.length - 1] = `${tasks[tasks.length - 1]} ${token}`
      else words.push(token)
      return
    }
    if (isPrefixAt(tokens, index)) {
      flushWords()
      prefix = token
      return
    }
    if (isExplicitCode(token)) {
      const code = normalizeCode(token)
      prefix = code.slice(0, code.indexOf('-'))
      addCode(code)
      return
    }
    if (/^\d+$/.test(token)) {
      addCode(prefix ? `${prefix}-${token}` : token)
      return
    }
    words.push(token)
  })
  flushWords()
  return tasks
}

export type DateOrder = 'day-month' | 'month-day'

export type ParsedNotes = {
  entries: DayEntry[]
  errors: string[]
  /** How numeric dates like 05/10 were read. Absent when no date was written that way. */
  dateOrder?: DateOrder
}

type Pending = { date: DateRead; minutes: number; text: string; label: string }

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function quote(line: string): string {
  const trimmed = line.trim()
  return trimmed.length > 40 ? `"${trimmed.slice(0, 40)}..."` : `"${trimmed}"`
}

function resolve(date: DateRead, order: DateOrder): { day: number; month: number; year?: number } {
  if (date.kind === 'fixed') return date
  return order === 'day-month'
    ? { day: date.first, month: date.second, year: date.year }
    : { day: date.second, month: date.first, year: date.year }
}

/**
 * Day/month or month/day: a number above 12 settles it. Otherwise the reading
 * that puts every day in one month wins, then the month the person picked,
 * then day/month.
 */
function chooseOrder(dates: DateRead[], preferMonth?: number): DateOrder | undefined {
  const numeric = dates.filter((date) => date.kind === 'numeric')
  if (numeric.length === 0) return undefined
  if (numeric.some((date) => date.first > 12)) return 'day-month'
  if (numeric.some((date) => date.second > 12)) return 'month-day'
  const orders: DateOrder[] = ['day-month', 'month-day']
  const months = (order: DateOrder) => new Set(dates.map((date) => resolve(date, order).month))
  const single = orders.filter((order) => months(order).size === 1)
  if (single.length === 1) return single[0]
  const candidates = single.length ? single : orders
  if (preferMonth) {
    const preferred = candidates.find((order) => months(order).has(preferMonth))
    if (preferred) return preferred
  }
  return candidates[0]
}

const SUMMARY_LINE = /^\s*(?:total|totals|sum|soma|subtotal)(?![\p{L}])/iu

/**
 * Reads the month's overtime notes, one day per line, in most of the ways
 * people write them. A line without a date continues the day above it.
 * `preferMonth` breaks a tie when 05/06 could be either day/month or month/day.
 */
export function parseOvertime(raw: string, options: { preferMonth?: number } = {}): ParsedNotes {
  const notes = normalizeNotes(raw)
  const errors: string[] = []
  const pending: Pending[] = []

  for (const line of notes.split('\n')) {
    if (!line.trim()) continue
    const date = readDate(line)
    if (!date) {
      const last = pending[pending.length - 1]
      if (SUMMARY_LINE.test(line)) continue
      if (last) last.text = `${last.text} ${remainder(line, [])}`.trim()
      else if (readTime(line, null)) errors.push(`No date on ${quote(line)}.`)
      continue
    }
    const label = line.slice(date.start, date.end).trim()
    const time = readTime(line, date)
    if (!time) {
      errors.push(`${label} has no time.`)
      continue
    }
    if (time.error) {
      errors.push(`${label} ${time.error}`)
      continue
    }
    if (time.minutes <= 0) {
      errors.push(`${label} has no time.`)
      continue
    }
    pending.push({ date, minutes: time.minutes, text: remainder(line, [date, ...time.spans]), label })
  }

  const dateOrder = chooseOrder(
    pending.map((item) => item.date),
    options.preferMonth,
  )
  const byDay = new Map<string, DayEntry>()
  const seenLines = new Set<string>()
  for (const item of pending) {
    const { day, month, year } = resolve(item.date, dateOrder ?? 'day-month')
    const label = `${pad(day)}/${pad(month)}`
    if (month < 1 || month > 12) {
      errors.push(`${item.label} is not a real date.`)
      continue
    }
    if (day < 1 || day > 31) {
      errors.push(`${item.label} is not a real date.`)
      continue
    }
    const tasks = tasksFromText(item.text)
    const key = `${year ?? ''}-${month}-${day}`
    const fingerprint = `${key}|${item.minutes}|${tasks.join(',')}`
    if (seenLines.has(fingerprint)) {
      errors.push(`${label} appears twice with the same hours and tasks.`)
      continue
    }
    seenLines.add(fingerprint)
    const existing = byDay.get(key)
    if (existing) {
      // Two sessions on the same day: add the time, keep both task lists.
      existing.totalMinutes += item.minutes
      existing.hours = Math.floor(existing.totalMinutes / 60)
      existing.minutes = existing.totalMinutes % 60
      for (const task of tasks) if (!existing.tasks.includes(task)) existing.tasks.push(task)
      continue
    }
    byDay.set(key, {
      day,
      month,
      ...(year ? { year } : {}),
      hours: Math.floor(item.minutes / 60),
      minutes: item.minutes % 60,
      totalMinutes: item.minutes,
      tasks,
    })
  }

  const entries = [...byDay.values()].sort(
    (a, b) => (a.year ?? b.year ?? 0) - (b.year ?? a.year ?? 0) || a.month - b.month || a.day - b.day,
  )
  if (!notes.trim()) errors.push('Paste the overtime notes for the month.')
  else if (entries.length === 0 && errors.length === 0) {
    errors.push('No days found. Write one day per line with a date and the time, like: 01/10 1:30 SOFT-100')
  }
  return { entries, errors, ...(dateOrder ? { dateOrder } : {}) }
}

export function assessMonth(
  entries: DayEntry[],
  year: number,
  month: number,
): string[] {
  const errors: string[] = []
  const last = daysInMonth(year, month)
  for (const entry of entries) {
    const label = `${String(entry.day).padStart(2, '0')}/${String(entry.month).padStart(2, '0')}`
    if (entry.month !== month) {
      errors.push(`${label} is outside the selected month.`)
      continue
    }
    if (entry.year !== undefined && entry.year !== year) {
      errors.push(`${label}/${entry.year} is outside the selected year.`)
      continue
    }
    if (entry.day < 1 || entry.day > last) errors.push(`${label} is not a day in that month.`)
  }
  return errors
}
