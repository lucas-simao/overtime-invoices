import { describe, expect, it } from 'vitest'
import {
  deleteProfile,
  emptyLibrary,
  parseLibrary,
  profileIdentity,
  profileSummary,
  upsertProfile,
} from '../src/core/profile-library'
import type { Profile } from '../src/core/types'

function profile(patch: Partial<Profile> = {}): Profile {
  return {
    issuer: {
      legalName: 'Northwind Studio Ltda.',
      addressLines: ['Rua Example, 100'],
      signName: 'Alex Rivera',
      shortName: 'Northwind Studio',
    },
    billTo: { name: 'Example Client', addressLines: ['100 Market St'] },
    serviceDescription: 'App development services',
    hourlyRate: 30,
    overtimePercent: 35,
    hoursPerBusinessDay: 8,
    recipientName: 'Jordan',
    ...patch,
  }
}

describe('profile library', () => {
  it('updates the same company, client, and rate in place', () => {
    const first = upsertProfile(emptyLibrary(), profile(), { id: 'a', now: '2026-11-01T00:00:00.000Z' })
    const next = upsertProfile(
      first,
      profile({ issuer: { ...profile().issuer, addressLines: ['Rua Nova, 2'] } }),
      { id: 'b', now: '2026-11-02T00:00:00.000Z' },
    )
    expect(next.profiles).toHaveLength(1)
    expect(next.profiles[0]?.id).toBe('a')
    expect(next.profiles[0]?.profile.issuer.addressLines).toEqual(['Rua Nova, 2'])
  })

  it('keeps the previous profile when the rate changes', () => {
    const first = upsertProfile(emptyLibrary(), profile(), { id: 'a' })
    const next = upsertProfile(first, profile({ hourlyRate: 40 }), { id: 'b' })
    expect(next.profiles.map((item) => item.id)).toEqual(['b', 'a'])
    expect(profileIdentity(next.profiles[0]!.profile)).not.toBe(profileIdentity(next.profiles[1]!.profile))
  })

  it('does not restore a deleted profile until it is saved again', () => {
    const saved = upsertProfile(emptyLibrary(), profile(), { id: 'a' })
    const removed = deleteProfile(saved, 'a')
    expect(removed.profiles).toEqual([])
    expect(removed.dismissed).toEqual([profileIdentity(profile())])
    const again = upsertProfile(removed, profile(), { id: 'c' })
    expect(again.profiles).toHaveLength(1)
    expect(again.dismissed).toEqual([])
  })

  it('drops entries that are not profiles', () => {
    const library = parseLibrary({
      profiles: [{ id: 'ok', profile: profile(), savedAt: 'today' }, { id: 'bad', profile: { hourlyRate: 1 } }],
      dismissed: ['keep', 4],
    })
    expect(library.profiles.map((item) => item.id)).toEqual(['ok'])
    expect(library.dismissed).toEqual(['keep'])
  })

  it('summarizes a profile with the rate', () => {
    expect(profileSummary(profile())).toBe('Northwind Studio · Example Client · $30/h · 35%')
    expect(profileSummary(profile({ hourlyRate: 30.5 }))).toBe(
      'Northwind Studio · Example Client · $30.50/h · 35%',
    )
  })
})
