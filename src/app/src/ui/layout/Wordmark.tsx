import { useI18n } from '../i18n.tsx'

/** Lowercase brand name plus the product label. The squares are a provisional geometric mark, not an official logo. */
export function Wordmark() {
  const { t } = useI18n()
  return (
    <div className="wordmark">
      <span className="wordmark__mark" aria-hidden="true" />
      <span className="wordmark__lockup">
        <span className="wordmark__name">apaleo</span>
        <span className="wordmark__product">{t('productName')}</span>
      </span>
    </div>
  )
}
