import { formatLongDate, formatMonthDay, MONTHS, MONTHS_SHORT } from './dates'
import { formatDuration, formatMoney, formatPercent, formatPlainDollars, invoiceAmountWords } from './money'
import type { Calculation, Profile } from './types'

const DASH = '\u2013'

export type Block =
  | { type: 'title'; text: string }
  | { type: 'date'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'bullet'; text: string }

export function invoiceTitle(calc: Calculation): string {
  return `INVOICE ${calc.invoiceId}`
}

export function invoiceFileName(calc: Calculation): string {
  return `Invoice ${calc.invoiceId}.pdf`
}

export function breakdownFileName(calc: Calculation): string {
  return `Overtime breakdown ${calc.invoiceId}.pdf`
}

export function invoiceIssueDate(calc: Calculation): string {
  return formatLongDate(calc.invoiceYear, calc.invoiceMonth, calc.invoiceDay)
}

export function periodLine(calc: Calculation): string {
  const start = formatLongDate(calc.year, calc.month, 1)
  const end = formatLongDate(calc.year, calc.month, calc.periodEndDay)
  return `From ${start}, ${end}`
}

export function totalSentence(calc: Calculation): string {
  return `Total: ${formatPlainDollars(calc.invoiceCents)} (${invoiceAmountWords(calc.invoiceCents)})`
}

export function buildEmail(profile: Profile, calc: Calculation): string {
  const month = MONTHS[calc.month - 1]
  return [
    `Dear ${profile.recipientName.trim()},`,
    '',
    "I hope you're doing well.",
    '',
    `Please find attached Invoice #${calc.invoiceId} for ${month} ${calc.year}, along with the Overtime Breakdown document detailing all overtime hours and the corresponding tasks completed during the month.`,
    '',
    'Invoice Summary',
    `Base salary: ${formatMoney(calc.baseCents)}`,
    `Overtime: ${formatMoney(calc.overtimeCents)} (${formatDuration(calc.overtimeMinutes)} hours)`,
    `Total invoice amount: ${formatMoney(calc.invoiceCents)}`,
    '',
    "If you have any questions or need any additional information, please don't hesitate to reach out.",
    '',
    'Thank you for your time and support.',
    '',
    'Best regards,',
    '',
    profile.issuer.signName.trim(),
    profile.issuer.shortName.trim(),
  ].join('\n')
}

function taskList(tasks: string[]): string {
  return tasks.length ? ` (Tasks: ${tasks.join(', ')})` : ''
}

export function buildBreakdown(profile: Profile, calc: Calculation): Block[] {
  const month = MONTHS[calc.month - 1]
  const short = MONTHS_SHORT[calc.month - 1]
  const hours = formatDuration(calc.overtimeMinutes)
  const blocks: Block[] = [
    { type: 'title', text: `Overtime breakdown ${calc.invoiceId}` },
    { type: 'date', text: formatLongDate(calc.year, calc.month, 1) },
    {
      type: 'paragraph',
      text: `Please find attached invoice #${calc.invoiceId} for your reference. This invoice covers ${hours} hours of overtime worked during ${month} ${calc.year}.`,
    },
    { type: 'heading', text: 'Base salary calculation' },
    {
      type: 'paragraph',
      text: `Period: ${short} 01${DASH}${String(calc.periodEndDay).padStart(2, '0')}`,
    },
    {
      type: 'bullet',
      text: `${calc.businessDays} business days x ${calc.hoursPerBusinessDay} hours = ${calc.baseHours} hours`,
    },
    { type: 'bullet', text: `${formatMoney(calc.hourlyCents)} per hour` },
    { type: 'bullet', text: `Subtotal: ${formatMoney(calc.baseCents)}` },
    { type: 'heading', text: `Overtime breakdown ${DASH} ${month} ${calc.year}` },
  ]
  for (const day of calc.days) {
    blocks.push({
      type: 'bullet',
      text: `${formatMonthDay(calc.month, day.day)} ${DASH} Total ${formatDuration(day.totalMinutes)}${taskList(day.tasks)}`,
    })
  }
  blocks.push(
    { type: 'heading', text: 'Base overtime calculation' },
    { type: 'bullet', text: `Base rate: ${formatMoney(calc.hourlyCents)}/hour` },
    {
      type: 'bullet',
      text: `Overtime rate: ${formatPercent(calc.overtimePercent)} = ${formatMoney(calc.overtimeRateCents)}/hour`,
    },
    {
      type: 'bullet',
      text: `${hours} hours x ${formatMoney(calc.overtimeRateCents)} = ${formatMoney(calc.overtimeCents)} overtime`,
    },
    { type: 'heading', text: 'Invoice Summary' },
    { type: 'bullet', text: `Base salary: ${formatMoney(calc.baseCents)}` },
    { type: 'bullet', text: `Overtime: ${formatMoney(calc.overtimeCents)}` },
    { type: 'bullet', text: `Total invoice amount: ${formatMoney(calc.invoiceCents)}` },
    {
      type: 'paragraph',
      text: "Should you have any questions or require additional clarification, please don't hesitate to reach out.",
    },
    { type: 'paragraph', text: 'Thank you for your attention.' },
    { type: 'paragraph', text: 'Best regards,' },
    { type: 'paragraph', text: profile.issuer.signName.trim() },
    { type: 'paragraph', text: profile.issuer.shortName.trim() },
  )
  return blocks
}
