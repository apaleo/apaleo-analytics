import type { MessageKey } from '../ui/i18n.tsx'
import { MIN_PERCENTILE_SAMPLES, type PercentileLevel } from './metrics.ts'
import type { StageDayCount } from './stageAging.ts'

export function fill(template: string, values: readonly (string | number)[]): string {
  return template.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = values[Number(index)]
    return value === undefined ? match : String(value)
  })
}

export function cycleTimeTipLines(
  cycleTimeDays: number,
  stages: readonly StageDayCount[],
  translate: (key: MessageKey) => string,
): string[] {
  return [
    `${translate('scatterTotalAge')}: ${cycleTimeDays} ${dayLabel(cycleTimeDays, translate)}`,
    ...stages.map((stage) => `${stage.name}: ${stage.days} ${dayLabel(stage.days, translate)}`),
  ]
}

function dayLabel(count: number, translate: (key: MessageKey) => string): string {
  return count === 1 ? translate('daySingular') : translate('dayUnit')
}

export function formatDays(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function percentileSentence(
  levels: readonly PercentileLevel[],
  needTemplate: string,
  listTemplate: string,
): string {
  if (levels.length < DEFAULT_LEVELS) return fill(needTemplate, [MIN_PERCENTILE_SAMPLES])
  return fill(
    listTemplate,
    levels.slice(0, DEFAULT_LEVELS).map((level) => formatDays(level.days)),
  )
}

const DEFAULT_LEVELS = 4

export function axisTop(values: readonly number[]): number {
  let max = 0
  for (const value of values) if (value > max) max = value
  return Math.max(1, Math.ceil(max * 1.08))
}
