import { daysInMonth } from './dates'
import type { DayEntry } from './types'

const ENTRY =
  /Horas Extras dia\s+(\d{1,2})\s*\/\s*(\d{1,2})\s*-\s*Total\s+(\d{1,2})\s*:\s*(\d{2})\s*([\s\S]*?)(?=Horas Extras dia\s+\d{1,2}\s*\/|$)/gi

export function normalizeNotes(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\(edited\)/gi, '')
    .replace(/Sent using @\S+/gi, '')
    .replace(/^.*\[\d{1,2}:\d{2}\s*[AP]M\].*$/gim, '')
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

export function parseOvertime(raw: string): { entries: DayEntry[]; errors: string[] } {
  ENTRY.lastIndex = 0
  const notes = normalizeNotes(raw)
  const entries: DayEntry[] = []
  const errors: string[] = []
  for (const match of notes.matchAll(ENTRY)) {
    const day = Number(match[1])
    const month = Number(match[2])
    const hours = Number(match[3])
    const minutes = Number(match[4])
    const label = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
    if (month < 1 || month > 12) {
      errors.push(`${label} is not a real month.`)
      continue
    }
    if (minutes > 59) {
      errors.push(`${label} has minutes above 59.`)
      continue
    }
    if (hours === 0 && minutes === 0) {
      errors.push(`${label} has no time.`)
      continue
    }
    entries.push({
      day,
      month,
      hours,
      minutes,
      totalMinutes: hours * 60 + minutes,
      tasks: tasksFromText(match[5] ?? ''),
    })
  }
  entries.sort((a, b) => a.month - b.month || a.day - b.day)
  const seen = new Set<string>()
  for (const entry of entries) {
    const key = `${entry.month}-${entry.day}`
    if (seen.has(key)) {
      errors.push(
        `${String(entry.day).padStart(2, '0')}/${String(entry.month).padStart(2, '0')} appears more than once.`,
      )
    }
    seen.add(key)
  }
  if (entries.length === 0 && notes.trim() && errors.length === 0) {
    errors.push(
      'No overtime entries found. Use lines like: Horas Extras dia 01/10 - Total 2:56 SOFT 100 101',
    )
  }
  if (!notes.trim()) errors.push('Paste the overtime notes for the month.')
  return { entries, errors }
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
    if (entry.day < 1 || entry.day > last) errors.push(`${label} is not a day in that month.`)
  }
  return errors
}
