const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

export function dollarsToCents(amount: number): number {
  return Math.round(amount * 100)
}

export function overtimeRateCents(hourlyCents: number, percent: number): number {
  return Math.round((hourlyCents * (100 + percent)) / 100)
}

/** Minutes × rate, rounded half up to the nearest cent. */
export function overtimeAmountCents(totalMinutes: number, rateCents: number): number {
  const numerator = totalMinutes * rateCents
  const quotient = Math.floor(numerator / 60)
  const remainder = numerator % 60
  return remainder * 2 >= 60 ? quotient + 1 : quotient
}

/** Drop cents so the invoice total is a whole dollar, matching the issued invoices. */
export function floorToDollar(cents: number): number {
  return Math.floor(cents / 100) * 100
}

export function formatAmount(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  const dollars = Math.floor(absolute / 100)
  const remainder = absolute % 100
  const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${grouped}.${String(remainder).padStart(2, '0')}`
}

export function formatMoney(cents: number): string {
  return `$${formatAmount(cents)}`
}

export function formatPlainDollars(cents: number): string {
  return `$${Math.floor(Math.abs(cents) / 100)}`
}

export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return `${rounded}%`
}

function underOneThousand(value: number): string {
  if (value < 20) return ONES[value]
  if (value < 100) {
    const tens = TENS[Math.floor(value / 10)]
    const ones = value % 10
    return ones ? `${tens}-${ONES[ones]}` : tens
  }
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  if (!rest) return `${ONES[hundreds]} hundred`
  return `${ONES[hundreds]} hundred and ${underOneThousand(rest)}`
}

/** Whole dollars, with "and" before a last part under one hundred. */
export function dollarWords(dollars: number): string {
  if (dollars < 0) throw new Error('Amount cannot be negative')
  if (dollars < 1000) return underOneThousand(dollars)
  const thousands = Math.floor(dollars / 1000)
  const rest = dollars % 1000
  const head = `${underOneThousand(thousands)} thousand`
  if (!rest) return head
  if (rest < 100) return `${head} and ${underOneThousand(rest)}`
  return `${head} ${underOneThousand(rest)}`
}

export function invoiceAmountWords(cents: number): string {
  const dollars = Math.floor(Math.abs(cents) / 100)
  return `${dollarWords(dollars)} dollars and zero cents`
}
