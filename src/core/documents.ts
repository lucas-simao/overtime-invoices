import { formatLongDate, MONTHS } from './dates'
import { formatDuration, formatMoney, formatPlainDollars, invoiceAmountWords } from './money'
import type { Calculation, Profile } from './types'

export function invoiceFileName(calc: Calculation): string {
  return `Invoice ${calc.invoiceId}.pdf`
}

export function breakdownFileName(calc: Calculation): string {
  return `Overtime breakdown ${calc.invoiceId}.pdf`
}

export function invoiceIssueDate(calc: Calculation): string {
  return formatLongDate(calc.invoiceYear, calc.invoiceMonth, calc.invoiceDay)
}

/** "23 days with overtime": the days in the notes, not the business days of the month. */
export function overtimeDaysLabel(days: number): string {
  return days === 1 ? '1 day with overtime' : `${days} days with overtime`
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

export function breakdownIntro(calc: Calculation): string {
  const month = MONTHS[calc.month - 1]
  return `Please find attached invoice #${calc.invoiceId} for your reference. This invoice covers ${formatDuration(calc.overtimeMinutes)} hours of overtime worked during ${month} ${calc.year}.`
}

export function breakdownClosing(): string[] {
  return [
    "Should you have any questions or require additional clarification, please don't hesitate to reach out.",
    'Thank you for your attention.',
    'Best regards,',
  ]
}
