import type { Profile } from './types'

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** A logo is a PNG or JPEG data URL, the two image types every PDF can hold. */
export function isLogo(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)
}

function isOptionalLogo(value: unknown): boolean {
  return value === undefined || value === '' || isLogo(value)
}

export function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Profile
  return (
    typeof profile.issuer?.legalName === 'string' &&
    isStringArray(profile.issuer.addressLines) &&
    typeof profile.issuer.signName === 'string' &&
    typeof profile.issuer.shortName === 'string' &&
    isOptionalLogo(profile.issuer.logo) &&
    typeof profile.billTo?.name === 'string' &&
    isStringArray(profile.billTo.addressLines) &&
    isOptionalLogo(profile.billTo.logo) &&
    typeof profile.serviceDescription === 'string' &&
    typeof profile.hourlyRate === 'number' &&
    Number.isFinite(profile.hourlyRate) &&
    typeof profile.overtimePercent === 'number' &&
    Number.isFinite(profile.overtimePercent) &&
    typeof profile.hoursPerBusinessDay === 'number' &&
    Number.isFinite(profile.hoursPerBusinessDay) &&
    typeof profile.recipientName === 'string'
  )
}

export function profileErrors(profile: Profile): string[] {
  const errors: string[] = []
  if (!profile.issuer.legalName.trim()) errors.push('Enter the legal name on the invoice.')
  if (!profile.issuer.signName.trim()) errors.push('Enter the name under the signature.')
  if (!profile.issuer.shortName.trim()) errors.push('Enter the short company name used in the email.')
  if (!profile.billTo.name.trim()) errors.push('Enter the client name.')
  if (!profile.serviceDescription.trim()) errors.push('Enter the service description.')
  if (!profile.recipientName.trim()) errors.push('Enter the name the email opens with.')
  if (!(profile.hourlyRate > 0)) errors.push('Enter an hourly rate above zero.')
  if (profile.overtimePercent < 0) errors.push('Overtime percent cannot be negative.')
  if (!(profile.hoursPerBusinessDay > 0)) errors.push('Enter the hours in a business day.')
  return errors
}
