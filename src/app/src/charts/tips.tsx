import type { MessageKey } from '../ui/i18n.tsx'
import type { FrequencyBin } from './metrics.ts'
import { fill } from './text.ts'

export interface ChartTipProps {
  active?: boolean
  label?: string | number
  payload?: readonly {
    name?: string | number
    value?: string | number | ReadonlyArray<string | number>
    payload?: unknown
  }[]
}

export function pointFrom<T extends object>(payload: ChartTipProps['payload']): T | undefined {
  const value = payload?.[0]?.payload
  if (value === null || typeof value !== 'object') return undefined
  return value as T
}

export function renderBinTip(
  props: ChartTipProps,
  t: (key: MessageKey) => string,
  key: 'cycleBin' | 'throughputBin' | 'flowBin',
) {
  if (!props.active) return null
  const bin = pointFrom<FrequencyBin>(props.payload)
  if (bin === undefined || typeof bin.value !== 'number') return null
  return (
    <div className="chart-tip">
      <p className="chart-tip__title">{fill(t(key), [bin.count, bin.value])}</p>
    </div>
  )
}
