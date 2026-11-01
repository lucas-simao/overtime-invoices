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

  it('rejects a repeated day and a date outside the selected month', () => {
    const parsed = parseOvertime(`
      Horas Extras dia 01/10 - Total 1:00 SOFT 10
      Horas Extras dia 01/10 - Total 2:00 SOFT 11
      Horas Extras dia 02/11 - Total 1:00 SOFT 12
    `)
    expect(parsed.errors).toContain('01/10 appears more than once.')
    expect(assessMonth(parsed.entries, 2026, 10)).toContain('02/11 is outside the selected month.')
  })
})
