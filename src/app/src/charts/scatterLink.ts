/** HTTP(S) link already stored on the item. The same check Source data uses before rendering an anchor. */
export function scatterItemUrl(link: string | undefined): string | undefined {
  if (link === undefined) return undefined
  if (/^https?:\/\//i.test(link)) return link
  return undefined
}

export function openScatterItem(
  link: string | undefined,
  open: (url: string, target: string, features: string) => void = (url, target, features) => {
    window.open(url, target, features)
  },
): void {
  const url = scatterItemUrl(link)
  if (url === undefined) return
  open(url, '_blank', 'noopener')
}

export function onScatterDotClick(point: { payload?: unknown }): void {
  const payload = point.payload
  if (payload === null || typeof payload !== 'object' || !('link' in payload)) return
  const link = payload.link
  openScatterItem(typeof link === 'string' ? link : undefined)
}
