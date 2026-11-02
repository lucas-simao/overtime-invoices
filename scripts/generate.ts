import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { calculate } from '../src/core/calculate'
import { breakdownFileName, buildEmail, invoiceFileName } from '../src/core/documents'
import { formatDuration, formatMoney } from '../src/core/money'
import { invoiceNumberError, parseIsoDate } from '../src/core/dates'
import { assessMonth, parseOvertime } from '../src/core/parse'
import { isProfile, profileErrors } from '../src/core/profile'
import { renderBreakdown } from '../src/pdf/breakdown'
import { renderInvoice } from '../src/pdf/invoice'

const { values } = parseArgs({
  options: {
    profile: { type: 'string' },
    input: { type: 'string' },
    year: { type: 'string' },
    out: { type: 'string' },
    date: { type: 'string' },
    number: { type: 'string' },
  },
})

function fail(message: string): never {
  console.error(message)
  console.error(
    'Usage: npm run generate -- --profile profile.json --input month.txt [--year 2026] [--date 2026-11-02] [--number 20261101] --out ./out',
  )
  process.exit(1)
}

if (!values.profile || !values.input || !values.out) fail('Missing an argument.')

const profile = JSON.parse(readFileSync(resolve(values.profile), 'utf8')) as unknown
if (!isProfile(profile)) fail('This file is not a profile.')
const profileProblems = profileErrors(profile)
if (profileProblems.length) fail(profileProblems.join('\n'))

const notes = readFileSync(resolve(values.input), 'utf8')
const parsed = parseOvertime(notes)
if (parsed.errors.length) fail(parsed.errors.join('\n'))
// The year comes from --year, or from the notes when they write it (01/10/2026).
const writtenYears = [...new Set(parsed.entries.flatMap((entry) => (entry.year ? [entry.year] : [])))]
const year = values.year ? Number(values.year) : writtenYears.length === 1 ? writtenYears[0] : NaN
if (!Number.isInteger(year)) fail('Add --year: the notes do not say which year they are from.')
const months = [...new Set(parsed.entries.map((entry) => entry.month))]
if (months.length !== 1) fail('The notes must belong to a single month.')
const month = months[0]
const monthProblems = assessMonth(parsed.entries, year, month)
if (monthProblems.length) fail(monthProblems.join('\n'))

const issueDate = values.date ? parseIsoDate(values.date) : undefined
if (issueDate === null) fail('--date must be a real date written as YYYY-MM-DD.')
const numberProblem = values.number !== undefined ? invoiceNumberError(values.number) : undefined
if (numberProblem) fail(numberProblem)

const calc = calculate({
  year,
  month,
  hourlyRate: profile.hourlyRate,
  overtimePercent: profile.overtimePercent,
  hoursPerBusinessDay: profile.hoursPerBusinessDay,
  workDays: profile.workDays,
  days: parsed.entries,
  issueDate,
  invoiceNumber: values.number,
})

const out = resolve(values.out)
mkdirSync(out, { recursive: true })
writeFileSync(join(out, invoiceFileName(calc)), await renderInvoice(profile, calc))
writeFileSync(join(out, breakdownFileName(calc)), await renderBreakdown(profile, calc))

console.log(`${calc.invoiceId}`)
console.log(`${parsed.entries.length} days, ${formatDuration(calc.overtimeMinutes)}`)
console.log(`Base ${formatMoney(calc.baseCents)}`)
console.log(`Overtime ${formatMoney(calc.overtimeCents)}`)
console.log(`Invoice ${formatMoney(calc.invoiceCents)}`)
for (const entry of parsed.entries) {
  console.log(
    `${String(entry.day).padStart(2, '0')}/${String(entry.month).padStart(2, '0')} ${formatDuration(entry.totalMinutes)} ${entry.tasks.join(', ')}`,
  )
}
console.log('---')
console.log(buildEmail(profile, calc))
