import { toPng } from 'html-to-image'

/**
 * Saves the active chart with html-to-image.
 * The capture paints the node through an SVG foreignObject. Browsers can refuse it when the
 * chart is very large, when it includes an image from another site, or in some Firefox builds.
 * A chart wider than about 1.6 million CSS pixels is captured at 1x instead of 2x to stay
 * under typical canvas limits.
 */
export async function downloadChartPng(node: HTMLElement, filename: string): Promise<void> {
  const rect = node.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) throw new Error('The chart area has no size.')

  const pixelRatio = rect.width * rect.height > 1_600_000 ? 1 : 2
  const dataUrl = await toPng(node, {
    cacheBust: true,
    backgroundColor: resolvedBackground(node),
    pixelRatio,
  })
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`
  document.body.append(link)
  link.click()
  link.remove()
}

function resolvedBackground(node: HTMLElement): string {
  const color = getComputedStyle(node).backgroundColor
  if (color.length === 0 || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return '#f4f7f5'
  return color
}
