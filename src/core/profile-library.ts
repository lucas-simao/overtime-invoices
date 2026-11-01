import { dollarsToCents, formatMoney, formatPercent } from './money'
import { isProfile } from './profile'
import type { Profile } from './types'

export type SavedProfile = {
  id: string
  profile: Profile
  savedAt: string
}

export type ProfileLibrary = {
  profiles: SavedProfile[]
  dismissed: string[]
}

export function emptyLibrary(): ProfileLibrary {
  return { profiles: [], dismissed: [] }
}

/** Company, client, and rates identify a profile. Address edits update that same entry. */
export function profileIdentity(profile: Profile): string {
  return [
    profile.issuer.legalName.trim().toLowerCase(),
    profile.billTo.name.trim().toLowerCase(),
    String(profile.hourlyRate),
    String(profile.overtimePercent),
    String(profile.hoursPerBusinessDay),
  ].join('\0')
}

export function profileSummary(profile: Profile): string {
  const company = profile.issuer.shortName.trim() || profile.issuer.legalName.trim()
  const client = profile.billTo.name.trim()
  return `${company} · ${client} · ${rateLabel(profile.hourlyRate)} · ${formatPercent(profile.overtimePercent)}`
}

export function upsertProfile(
  library: ProfileLibrary,
  profile: Profile,
  options: { now?: string; id?: string } = {},
): ProfileLibrary {
  const now = options.now ?? new Date().toISOString()
  const identity = profileIdentity(profile)
  const dismissed = library.dismissed.filter((item) => item !== identity)
  const index = library.profiles.findIndex((item) => profileIdentity(item.profile) === identity)
  if (index >= 0) {
    const profiles = library.profiles.map((item, itemIndex) =>
      itemIndex === index ? { ...item, profile, savedAt: now } : item,
    )
    return { profiles, dismissed }
  }
  return {
    profiles: [{ id: options.id ?? crypto.randomUUID(), profile, savedAt: now }, ...library.profiles],
    dismissed,
  }
}

export function deleteProfile(library: ProfileLibrary, id: string): ProfileLibrary {
  const target = library.profiles.find((item) => item.id === id)
  if (!target) return library
  const identity = profileIdentity(target.profile)
  return {
    profiles: library.profiles.filter((item) => item.id !== id),
    dismissed: library.dismissed.includes(identity) ? library.dismissed : [...library.dismissed, identity],
  }
}

export function parseLibrary(value: unknown): ProfileLibrary {
  if (!value || typeof value !== 'object') return emptyLibrary()
  const record = value as { profiles?: unknown; dismissed?: unknown }
  const profiles = Array.isArray(record.profiles)
    ? record.profiles.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const saved = item as Partial<SavedProfile>
        if (typeof saved.id !== 'string' || !isProfile(saved.profile)) return []
        return [
          {
            id: saved.id,
            profile: saved.profile,
            savedAt: typeof saved.savedAt === 'string' ? saved.savedAt : '',
          },
        ]
      })
    : []
  const dismissed = Array.isArray(record.dismissed)
    ? record.dismissed.filter((item): item is string => typeof item === 'string')
    : []
  return { profiles, dismissed }
}

function rateLabel(amount: number): string {
  const cents = dollarsToCents(amount)
  if (cents % 100 === 0) return `$${cents / 100}/h`
  return `${formatMoney(cents)}/h`
}
