import { CHARTS, type ChartId } from '../charts.ts'
import { useI18n } from '../i18n.tsx'

export function ChartNav({
  selectedId,
  onSelect,
}: {
  selectedId: ChartId
  onSelect: (chartId: ChartId) => void
}) {
  const { t } = useI18n()
  return (
    <nav className="chart-nav" aria-label={t('chartList')}>
      <ol className="chart-nav__list">
        {CHARTS.map((chart, index) => {
          const selected = chart.id === selectedId
          const className = selected ? 'chart-nav__item chart-nav__item--active' : 'chart-nav__item'
          return (
            <li key={chart.id}>
              <button
                type="button"
                className={className}
                aria-current={selected ? 'page' : undefined}
                onClick={() => onSelect(chart.id)}
              >
                <span className="chart-nav__index">{index + 1}</span>
                <span>{t(chart.labelKey)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
