/*
 * Reading the date and the time worked out of one line of notes, in the
 * formats people actually type: 01/10, 1/10/2026, 2026-10-01, Oct 1,
 * 1 de outubro; 1:30, 1h30, 1h 30m, 90min, 1.5h, 1,5 horas, 01:30:00,
 * 18:00-20:30.
 */

export type Span = { start: number; end: number }

/** A date as written. Numeric day/month dates stay unresolved until the whole month is read. */
export type DateRead = Span &
  (
    | { kind: 'fixed'; day: number; month: number; year?: number }
    | { kind: 'numeric'; first: number; second: number; year?: number }
  )

export type TimeRead = { minutes: number; spans: Span[]; error?: string }

const MONTH_NAMES: [RegExp, number][] = [
  [/^(jan|january|janeiro)$/, 1],
  [/^(feb|february|fev|fevereiro)$/, 2],
  [/^(mar|march|marco|março)$/, 3],
  [/^(apr|april|abr|abril)$/, 4],
  [/^(may|mai|maio)$/, 5],
  [/^(jun|june|junho)$/, 6],
  [/^(jul|july|julho)$/, 7],
  [/^(aug|august|ago|agosto)$/, 8],
  [/^(sep|sept|september|set|setembro)$/, 9],
  [/^(oct|october|out|outubro)$/, 10],
  [/^(nov|november|novembro)$/, 11],
  [/^(dec|december|dez|dezembro)$/, 12],
]
const MONTH_WORD =
  'jan(?:uary|eiro)?|feb(?:ruary)?|fev(?:ereiro)?|mar(?:ch|ço|co)?|apr(?:il)?|abr(?:il)?|may|mai(?:o)?|jun(?:e|ho)?|jul(?:y|ho)?|aug(?:ust)?|ago(?:sto)?|sept?(?:ember)?|set(?:embro)?|oct(?:ober)?|out(?:ubro)?|nov(?:ember|embro)?|dec(?:ember)?|dez(?:embro)?'

function monthFromWord(word: string): number | undefined {
  const lower = word.toLowerCase().replace(/\.$/, '')
  return MONTH_NAMES.find(([pattern]) => pattern.test(lower))?.[1]
}

function fullYear(text: string | undefined): number | undefined {
  if (!text) return undefined
  const value = Number(text)
  return text.length === 2 ? 2000 + value : value
}

// A unit after a number means it is a time, not a date ("1.5h", "10.5 horas").
const NOT_A_UNIT = String.raw`(?!\s*(?:h|hr|hrs|hours?|horas?|m|min|mins|minutes?|minutos?)(?![\p{L}]))`

const DATE_PATTERNS: { pattern: RegExp; read: (m: RegExpExecArray) => DateRead | null }[] = [
  {
    // 2026-10-01, 2026/10/01
    pattern: /(?<![\p{L}\d/.:-])(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d|:\d|[-/.]\d)/gu,
    read: (m) => ({
      kind: 'fixed',
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      start: m.index,
      end: m.index + m[0].length,
    }),
  },
  {
    // 01/10, 1/10/2026, 01.10, 01-10-26
    pattern: new RegExp(
      String.raw`(?<![\p{L}\d/.:-])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?!\d|:\d|[/.-]\d)${NOT_A_UNIT}`,
      'gu',
    ),
    read: (m) => ({
      kind: 'numeric',
      first: Number(m[1]),
      second: Number(m[2]),
      year: fullYear(m[3]),
      start: m.index,
      end: m.index + m[0].length,
    }),
  },
  {
    // 1 Oct, 1st October 2026, 01 de outubro de 2026
    pattern: new RegExp(
      String.raw`(?<![\p{L}\d:])(\d{1,2})(?:st|nd|rd|th|º|°)?\s*(?:de\s+|of\s+)?(${MONTH_WORD})\.?(?:,?\s*(?:de\s+)?(\d{4}))?(?![\p{L}])`,
      'giu',
    ),
    read: (m) => {
      const month = monthFromWord(m[2])
      return month
        ? { kind: 'fixed', day: Number(m[1]), month, year: fullYear(m[3]), start: m.index, end: m.index + m[0].length }
        : null
    },
  },
  {
    // Oct 1, October 1st, 2026
    pattern: new RegExp(
      String.raw`(?<![\p{L}])(${MONTH_WORD})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?(?!\d|:\d|[\p{L}])`,
      'giu',
    ),
    read: (m) => {
      const month = monthFromWord(m[1])
      return month
        ? { kind: 'fixed', day: Number(m[2]), month, year: fullYear(m[3]), start: m.index, end: m.index + m[0].length }
        : null
    },
  },
]

/** The first date written on the line, if any. */
export function readDate(line: string): DateRead | null {
  let best: DateRead | null = null
  for (const { pattern, read } of DATE_PATTERNS) {
    pattern.lastIndex = 0
    for (let m = pattern.exec(line); m; m = pattern.exec(line)) {
      const date = read(m)
      if (date && (!best || date.start < best.start)) best = date
      if (date) break
    }
  }
  return best
}

type Candidate = Span & { minutes: number; error?: string }

const HOUR_UNIT = String.raw`(?:h|hr|hrs|hours?|horas?)`
const MINUTE_UNIT = String.raw`(?:m|min|mins|minutes?|minutos?)`
const BEFORE = String.raw`(?<![\p{L}\d:.,/])`
const AFTER = String.raw`(?![\p{L}\d])`

const TIME_PATTERNS: { pattern: RegExp; read: (m: RegExpExecArray) => Omit<Candidate, 'start' | 'end'> }[] = [
  {
    // 1h30, 1h 30m, 2 hours 15 minutes, 1 hora e 30 minutos
    pattern: new RegExp(
      String.raw`${BEFORE}(\d{1,3})\s*${HOUR_UNIT}\s*(?:e\s+|and\s+)?(\d{1,2})\s*(?:${MINUTE_UNIT})?${AFTER}`,
      'giu',
    ),
    read: (m) => clock(Number(m[1]), Number(m[2])),
  },
  {
    // 1:30, 01:30:00, 1:30h
    pattern: new RegExp(
      String.raw`${BEFORE}(\d{1,3}):(\d{2})(?::(\d{2}))?(?![\d:])\s*(?:${HOUR_UNIT}${AFTER})?(?!\s*[ap]\.?m\.?(?![\p{L}]))`,
      'giu',
    ),
    read: (m) => clock(Number(m[1]), Number(m[2]), Number(m[3] ?? 0)),
  },
  {
    // 2h, 1.5h, 1,5 horas
    pattern: new RegExp(String.raw`${BEFORE}(\d{1,3}(?:[.,]\d{1,2})?)\s*${HOUR_UNIT}${AFTER}`, 'giu'),
    read: (m) => ({ minutes: Math.round(Number(m[1].replace(',', '.')) * 60) }),
  },
  {
    // 90min, 45 m, 30 minutos
    pattern: new RegExp(String.raw`${BEFORE}(\d{1,4})\s*${MINUTE_UNIT}${AFTER}`, 'giu'),
    read: (m) => ({ minutes: Number(m[1]) }),
  },
]

function clock(hours: number, minutes: number, seconds = 0): Omit<Candidate, 'start' | 'end'> {
  if (minutes > 59) return { minutes: 0, error: 'has minutes above 59.' }
  return { minutes: hours * 60 + minutes + Math.round(seconds / 60) }
}

const RANGE = new RegExp(
  String.raw`${BEFORE}(\d{1,2})[:h](\d{2})\s*(?:-|–|—|to|até|a|às)\s*(\d{1,2})[:h](\d{2})(?![\d:])`,
  'giu',
)

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end
}

function blank(text: string, spans: Span[]): string {
  let out = text
  for (const span of spans) out = out.slice(0, span.start) + ' '.repeat(span.end - span.start) + out.slice(span.end)
  return out
}

/**
 * The time worked on the line. Ranges (18:00-20:30) are added up. Otherwise
 * the duration after "Total" wins, then the first one after the date, then
 * a bare decimal (1.5) or a small whole number right after the date.
 */
export function readTime(line: string, date: Span | null): TimeRead | null {
  const text = blank(line, date ? [date] : [])
  const after = date?.end ?? 0

  const ranges: Span[] = []
  let rangeMinutes = 0
  RANGE.lastIndex = 0
  for (let m = RANGE.exec(text); m; m = RANGE.exec(text)) {
    const from = Number(m[1]) * 60 + Number(m[2])
    const to = Number(m[3]) * 60 + Number(m[4])
    if (Number(m[2]) > 59 || Number(m[4]) > 59 || from >= 24 * 60 || to > 24 * 60) continue
    rangeMinutes += to > from ? to - from : 24 * 60 - from + to
    ranges.push({ start: m.index, end: m.index + m[0].length })
  }
  if (ranges.length) return { minutes: rangeMinutes, spans: ranges }

  const candidates: Candidate[] = []
  for (const { pattern, read } of TIME_PATTERNS) {
    pattern.lastIndex = 0
    for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
      const span = { start: m.index, end: m.index + m[0].length }
      if (candidates.some((c) => overlaps(c, span))) continue
      candidates.push({ ...span, ...read(m) })
    }
  }
  candidates.sort((a, b) => a.start - b.start)

  const afterTotal = candidates.find((c) => /(?:^|[^\p{L}])total\s*[:=-]?\s*$/iu.test(text.slice(0, c.start)))
  const pick = afterTotal ?? candidates.find((c) => c.start >= after) ?? candidates[0]
  if (pick) return { minutes: pick.minutes, spans: [pick], error: pick.error }

  // A bare decimal (spreadsheets: "01/10/2026, 1.5, SOFT-100") or "01/10 2 SOFT-100".
  const rest = text.slice(after)
  const bare = /^[\s,;|\t:-]*(\d{1,2}(?:[.,]\d{1,2})?)(?=$|[\s,;|\t])/.exec(rest)
  if (bare) {
    const hours = Number(bare[1].replace(',', '.'))
    if (hours > 0 && hours <= 24) {
      const start = after + bare[0].length - bare[1].length
      return { minutes: Math.round(hours * 60), spans: [{ start, end: start + bare[1].length }] }
    }
  }
  const decimal = new RegExp(String.raw`${BEFORE}(\d{1,2}[.,]\d{1,2})(?![\p{L}\d.,/:-])`, 'u').exec(text)
  if (decimal) {
    return {
      minutes: Math.round(Number(decimal[1].replace(',', '.')) * 60),
      spans: [{ start: decimal.index, end: decimal.index + decimal[0].length }],
    }
  }
  return null
}

const FILLER = new RegExp(
  String.raw`(?<![\p{L}\d])(?:horas?\s+extras?|hora\s+extra|h\.?e\.?|overtime|ot|dia|day|date|data|total|hours?|hrs?|horas?|worked|trabalhad[oa]s?|on|em|no|of|de|do|da|` +
    String.raw`mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|` +
    String.raw`seg(?:unda)?|ter(?:ça|ca)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|s[áa]b(?:ado)?|dom(?:ingo)?)(?:-feira)?\.?(?![\p{L}\d])`,
  'giu',
)

/**
 * What is left of the line for the task list: the date and the time removed,
 * and the words around them ("Horas Extras dia", "Total", a weekday) dropped.
 */
export function remainder(line: string, used: Span[]): string {
  const last = Math.max(0, ...used.map((span) => span.end))
  const head = blank(line.slice(0, last), used).replace(FILLER, ' ')
  return `${head} ${line.slice(last)}`
    // A quoted spreadsheet cell: "SOFT-1, SOFT-2" is a list, not a phrase.
    .replace(/(^|[,;\t])\s*"([^"]*)"\s*(?=[,;\t]|$)/g, '$1 $2')
    .replace(/[|\t•·]/g, ' ')
    .replace(/(^|\s)[:=\-–—]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
