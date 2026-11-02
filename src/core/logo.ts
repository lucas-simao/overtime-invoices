import { isLogo } from './profile'

export type LogoData = { kind: 'png' | 'jpeg'; bytes: Uint8Array }

/** The bytes inside a logo data URL, or null when it is not a PNG or JPEG logo. */
export function decodeLogo(dataUrl: string | undefined): LogoData | null {
  if (!dataUrl || !isLogo(dataUrl)) return null
  const kind = dataUrl.startsWith('data:image/png') ? 'png' : 'jpeg'
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return { kind, bytes }
}
