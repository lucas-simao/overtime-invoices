import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assessMonth, parseOvertime, tasksFromText } from '../src/core/parse'
import { formatDuration } from '../src/core/money'

const notes = `
Alex Example  [9:00 AM]
Horas Extras dia 01/06 - Total 1:30 SOFT Draft the sample feature, 100 101 (edited)
Alex Example  [9:10 AM]
Horas Extras dia 02/06 - Total 2:00 SOFT 200 Sample component (Alex) 201
Horas Extras dia 03/06 - Total 0:45 SOFT 300, 301 PLA-400
Horas Extras dia 04/06 - Total 3:10 APP 10 11 12
Horas Extras dia 05/06 - Total 1:05 SOFT PUBLIC FORM "Sample Person" APP-8 APP-9
Horas Extras dia 06/06 - Total 4:00 PLA 500 501 500
Horas Extras dia 07/06 - Total 0:20 PLA 587 (Sample note)
Sent using @ClaudeAlex Example  [8:41 PM]
Horas Extras dia 08/06 - Total 1:00 — PLA 12, 13
`

describe('task codes', () => {
  it('keeps a leading description and applies the project prefix to later numbers', () => {
    expect(tasksFromText('FIXED the login, SOFT 100')).toEqual(['FIXED the login', 'SOFT-100'])
  })

  it('treats a leading project tag with no numbers of its own as a label, not a task', () => {
    expect(tasksFromText('SOFT PUBLIC FORM "Sample Person" APP-8 APP-9')).toEqual([
      'PUBLIC FORM "Sample Person"',
      'APP-8',
      'APP-9',
    ])
  })

  it('drops a repeated code and keeps a parenthetical on the code it describes', () => {
    expect(tasksFromText('PLA 500 501 500')).toEqual(['PLA-500', 'PLA-501'])
    expect(tasksFromText('PLA 587 (Sample note)')).toEqual(['PLA-587 (Sample note)'])
    expect(tasksFromText('SOFT 210 Sample panel (Alex) 211')).toEqual([
      'SOFT-210',
      'Sample panel (Alex)',
      'SOFT-211',
    ])
  })
})

describe('slack notes', () => {
  it('parses the month and ignores names, timestamps, and edited markers', () => {
    const parsed = parseOvertime(notes)
    expect(parsed.errors).toEqual([])
    expect(parsed.entries.map((entry) => entry.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(parsed.entries[0]?.tasks).toEqual([
      'Draft the sample feature',
      'SOFT-100',
      'SOFT-101',
    ])
    expect(parsed.entries[1]?.tasks).toEqual([
      'SOFT-200',
      'Sample component (Alex)',
      'SOFT-201',
    ])
    expect(parsed.entries[2]?.tasks).toEqual(['SOFT-300', 'SOFT-301', 'PLA-400'])
    expect(parsed.entries[3]?.tasks).toEqual(['APP-10', 'APP-11', 'APP-12'])
    expect(parsed.entries[4]?.tasks).toEqual(['PUBLIC FORM "Sample Person"', 'APP-8', 'APP-9'])
    expect(parsed.entries[5]?.tasks).toEqual(['PLA-500', 'PLA-501'])
    expect(parsed.entries[6]?.tasks).toEqual(['PLA-587 (Sample note)'])
    expect(parsed.entries[7]?.tasks).toEqual(['PLA-12', 'PLA-13'])
    const minutes = parsed.entries.reduce((sum, entry) => sum + entry.totalMinutes, 0)
    expect(formatDuration(minutes)).toBe('13:50')
    expect(JSON.stringify(parsed)).not.toContain('edited')
    expect(JSON.stringify(parsed)).not.toContain('AM')
  })

  it('reads the committed example month', () => {
    const example = readFileSync(new URL('../examples/sample-month.txt', import.meta.url), 'utf8')
    const parsed = parseOvertime(example)
    expect(parsed.errors).toEqual([])
    expect(parsed.entries).toHaveLength(3)
    expect(assessMonth(parsed.entries, 2026, 10)).toEqual([])
    const minutes = parsed.entries.reduce((sum, entry) => sum + entry.totalMinutes, 0)
    expect(minutes).toBe(270)
  })

  it('adds up two sessions on the same day, rejects a pasted duplicate and a date outside the month', () => {
    const parsed = parseOvertime(`
      Horas Extras dia 01/10 - Total 1:00 SOFT 10
      Horas Extras dia 01/10 - Total 2:00 SOFT 11
      Horas Extras dia 02/11 - Total 1:00 SOFT 12
    `)
    expect(parsed.entries[0]).toEqual({
      day: 1,
      month: 10,
      hours: 3,
      minutes: 0,
      totalMinutes: 180,
      tasks: ['SOFT-10', 'SOFT-11'],
    })
    expect(assessMonth(parsed.entries, 2026, 10)).toContain('02/11 is outside the selected month.')
    const pasted = parseOvertime('01/10 1:00 SOFT-1\n01/10 1:00 SOFT-1')
    expect(pasted.errors).toEqual(['01/10 appears twice with the same hours and tasks.'])
  })
})

function read(text: string, options?: { preferMonth?: number }): string[] {
  const parsed = parseOvertime(text, options)
  expect(parsed.errors).toEqual([])
  return parsed.entries.map(
    (entry) =>
      `${String(entry.day).padStart(2, '0')}/${String(entry.month).padStart(2, '0')} ${formatDuration(entry.totalMinutes)} ${entry.tasks.join(', ')}`,
  )
}

describe('other ways of writing the notes', () => {
  it('reads the time in any common form', () => {
    expect(
      read(`
        01/10 1:30 SOFT-1
        02/10 1h30 SOFT-2
        03/10 1h 30m SOFT-3
        04/10 1.5h SOFT-4
        05/10 1,5 horas SOFT-5
        06/10 90 min SOFT-6
        07/10 2 horas e 15 minutos SOFT-7
        08/10 01:30:00 SOFT-8
        09/10 18:00-20:30 SOFT-9
        10/10 08:00 - 09:00, 18:30 às 20:00 SOFT-10
      `),
    ).toEqual([
      '01/10 1:30 SOFT-1',
      '02/10 1:30 SOFT-2',
      '03/10 1:30 SOFT-3',
      '04/10 1:30 SOFT-4',
      '05/10 1:30 SOFT-5',
      '06/10 1:30 SOFT-6',
      '07/10 2:15 SOFT-7',
      '08/10 1:30 SOFT-8',
      '09/10 2:30 SOFT-9',
      '10/10 2:30 SOFT-10',
    ])
  })

  it('reads dates with a year, in ISO, and with month names in English or Portuguese', () => {
    expect(
      read(`
        2026-10-01 1:00 A-1
        02/10/2026 1:00 A-2
        Oct 3: 1:00 A-3
        October 4th, 2026 | 1:00 | A-4
        5 de outubro — 1:00 — A-5
        Mon 06/10 Total: 1:00 A-6
      `),
    ).toEqual(['01/10 1:00 A-1', '02/10 1:00 A-2', '03/10 1:00 A-3', '04/10 1:00 A-4', '05/10 1:00 A-5', '06/10 1:00 A-6'])
  })

  it('reads rows pasted from a spreadsheet', () => {
    expect(
      read('Date,Hours,Tasks\n01/10/2026,1.5,"SOFT-1, SOFT-2"\n02/10/2026\t2:15\tSOFT-3'),
    ).toEqual(['01/10 1:30 SOFT-1, SOFT-2', '02/10 2:15 SOFT-3'])
  })

  it('works out month/day from the dates themselves, or from the month picked', () => {
    const us = parseOvertime('10/23 1:00 A-1\n10/24 2:00 A-2')
    expect(us.dateOrder).toBe('month-day')
    expect(us.entries.map((entry) => [entry.month, entry.day])).toEqual([
      [10, 23],
      [10, 24],
    ])
    // 01/10, 02/10, 03/10 only fit in one month when read as day/month.
    expect(parseOvertime('01/10 1:00 A\n02/10 1:00 B\n03/10 1:00 C').dateOrder).toBe('day-month')
    expect(read('05/06 1:00 X-1', { preferMonth: 6 })).toEqual(['05/06 1:00 X-1'])
    expect(read('05/06 1:00 X-1', { preferMonth: 5 })).toEqual(['06/05 1:00 X-1'])
  })

  it('continues a day on the next line and skips a total line', () => {
    expect(read('01/10 1:00 SOFT-1\n  also reviewed PLA 22\n02/10 0:30 SOFT-2\nTotal 1:30')).toEqual([
      '01/10 1:00 SOFT-1, also reviewed, PLA-22',
      '02/10 0:30 SOFT-2',
    ])
  })

  it('explains what it could not read', () => {
    expect(parseOvertime('01/10 SOFT-1').errors).toEqual(['01/10 has no time.'])
    expect(parseOvertime('01/10 1:75 SOFT-1').errors).toEqual(['01/10 has minutes above 59.'])
    expect(parseOvertime('1:30 SOFT-1').errors).toEqual(['No date on "1:30 SOFT-1".'])
    expect(parseOvertime('2026-10-01 1:00 A').entries[0]?.year).toBe(2026)
    expect(assessMonth(parseOvertime('01/10/2025 1:00 A').entries, 2026, 10)).toEqual([
      '01/10/2025 is outside the selected year.',
    ])
  })
})
