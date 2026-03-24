/** Mini sparkline as PNG data URL (browser only). */
export function sparklineDataUrl(
  values: number[],
  width = 240,
  height = 80,
): string | undefined {
  if (typeof document === 'undefined' || values.length < 2) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined

  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = 4
  const span = max - min || 1

  ctx.fillStyle = '#151821'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#22c55e'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i < values.length; i++) {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2)
    const y = pad + (1 - (values[i]! - min) / span) * (height - pad * 2)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  try {
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}
