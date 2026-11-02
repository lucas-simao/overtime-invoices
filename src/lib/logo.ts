/**
 * Turns an image the person picks into a logo the PDFs can hold: a PNG data
 * URL no larger than it needs to be. SVG and WebP are drawn onto a canvas
 * first, since a PDF only takes PNG and JPEG; transparency is kept.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024
// Twice the largest size a logo is printed at, so it stays sharp on paper.
const MAX_WIDTH = 680
const MAX_HEIGHT = 176

export const LOGO_ACCEPT = "image/png,image/jpeg,image/svg+xml,image/webp"

export class LogoError extends Error {}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new LogoError("This file is not an image the page can read."))
    image.src = url
  })
}

export async function fileToLogo(file: File): Promise<string> {
  if (!LOGO_ACCEPT.split(",").includes(file.type)) {
    throw new LogoError("Use a PNG, JPEG, SVG or WebP image.")
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new LogoError("Use an image smaller than 5 MB.")
  }
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    // An SVG without a width and height reports 0; give it a size to draw at.
    const naturalWidth = image.naturalWidth || 600
    const naturalHeight = image.naturalHeight || 200
    const scale = Math.min(1, MAX_WIDTH / naturalWidth, MAX_HEIGHT / naturalHeight)
    const width = Math.max(1, Math.round(naturalWidth * scale))
    const height = Math.max(1, Math.round(naturalHeight * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) throw new LogoError("This browser could not read the image.")
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL("image/png")
  } finally {
    URL.revokeObjectURL(url)
  }
}
