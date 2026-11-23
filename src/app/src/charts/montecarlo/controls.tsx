import type { ReactNode } from 'react'
import type { MessageKey } from '../../ui/i18n.tsx'
import { useI18n } from '../../ui/i18n.tsx'
import { percentileColor } from '../chartTheme.ts'
import { fill } from '../text.ts'
import { isTrialOption, MAX_REMAINING, TRIAL_OPTIONS, type ThroughputGrain, type TrialOption } from './simulate.ts'

const TRIAL_LABEL: Record<TrialOption, MessageKey> = {
  10_000: 'mcTrials10k',
  100_000: 'mcTrials100k',
  500_000: 'mcTrials500k',
  1_000_000: 'mcTrials1m',
}

export function SimulationToolbar({
  trials,
  onTrials,
  count,
  countLabel,
  countMin,
  countMax,
  onCount,
  grain,
  onGrain,
  seedText,
  onSeed,
  running = false,
}: {
  trials: number
  onTrials: (value: number) => void
  count: number
  countLabel: string
  countMin: number
  countMax: number
  onCount: (value: number) => void
  grain: ThroughputGrain
  onGrain: (value: ThroughputGrain) => void
  seedText: string
  onSeed: (value: string) => void
  running?: boolean
}) {
  return (
    <ControlRow trials={trials} onTrials={onTrials} grain={grain} onGrain={onGrain} seedText={seedText} onSeed={onSeed} running={running}>
      <CountField label={countLabel} value={count} min={countMin} max={countMax} onChange={onCount} />
    </ControlRow>
  )
}

export function WhenSimulationToolbar({
  trials,
  onTrials,
  includeWip,
  onIncludeWip,
  openItems,
  showOpenItems,
  onToggleOpenItems,
  extra,
  onExtra,
  grain,
  onGrain,
  seedText,
  onSeed,
  running = false,
}: {
  trials: number
  onTrials: (value: number) => void
  includeWip: boolean
  onIncludeWip: (value: boolean) => void
  /** Open issue count for the When forecast. The button shows and hides those rows. */
  openItems: number
  showOpenItems: boolean
  onToggleOpenItems: () => void
  extra: number
  onExtra: (value: number) => void
  grain: ThroughputGrain
  onGrain: (value: ThroughputGrain) => void
  seedText: string
  onSeed: (value: string) => void
  running?: boolean
}) {
  const { t } = useI18n()
  const openCount = Number.isFinite(openItems) ? Math.max(0, Math.floor(openItems)) : 0
  return (
    <ControlRow trials={trials} onTrials={onTrials} grain={grain} onGrain={onGrain} seedText={seedText} onSeed={onSeed} running={running}>
      <div className="mc-control mc-control--check">
        <input
          type="checkbox"
          checked={includeWip}
          aria-label={fill(t('mcIncludeWip'), [openCount])}
          onChange={(event) => onIncludeWip(event.target.checked)}
        />
        <button
          type="button"
          className="mc-open-count"
          aria-expanded={showOpenItems}
          aria-controls="monte-carlo-open-items"
          onClick={onToggleOpenItems}
        >
          {fill(t('mcIncludeWip'), [openCount])}
        </button>
      </div>
      <CountField label={t('mcExtraItems')} value={extra} min={0} max={MAX_REMAINING} onChange={onExtra} />
    </ControlRow>
  )
}

export function PercentileTable({ rows }: { rows: readonly { percentile: number; text: string }[] }) {
  const { t } = useI18n()
  if (rows.length === 0) return null
  return (
    <table className="percentile-table">
      <thead>
        <tr>
          <th>{t('mcPercentile')}</th>
          <th>{t('mcForecast')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.percentile}>
            <td>
              <span className="percentile-table__swatch" style={{ background: percentileColor(row.percentile) }} />
              {row.percentile}%
            </td>
            <td>{row.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ControlRow({
  trials,
  onTrials,
  grain,
  onGrain,
  seedText,
  onSeed,
  running,
  children,
}: {
  trials: number
  onTrials: (value: number) => void
  grain: ThroughputGrain
  onGrain: (value: ThroughputGrain) => void
  seedText: string
  onSeed: (value: string) => void
  running: boolean
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="mc-controls">
      <label className="mc-control">
        <span>{t('mcTrials')}</span>
        <select
          value={trials}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (isTrialOption(next)) onTrials(next)
          }}
        >
          {TRIAL_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(TRIAL_LABEL[option])}
            </option>
          ))}
        </select>
      </label>
      {children}
      <label className="mc-control">
        <span>{t('mcGrain')}</span>
        <select value={grain} onChange={(event) => onGrain(event.target.value === 'week' ? 'week' : 'day')}>
          <option value="day">{t('mcGrainDay')}</option>
          <option value="week">{t('mcGrainWeek')}</option>
        </select>
      </label>
      <label className="mc-control">
        <span>{t('mcSeed')}</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder={t('mcSeedPlaceholder')}
          spellCheck={false}
          value={seedText}
          onChange={(event) => onSeed(normalizeSeedInput(event.target.value))}
        />
      </label>
      {running ? (
        <p className="mc-running" role="status">
          {t('mcRunning')}
        </p>
      ) : null}
    </div>
  )
}

function CountField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="mc-control">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </label>
  )
}

function normalizeSeedInput(text: string): string {
  const negative = text.startsWith('-')
  const digits = text.replace(/\D/g, '').slice(0, 10)
  if (digits.length === 0) return negative ? '-' : ''
  return negative ? `-${digits}` : digits
}
