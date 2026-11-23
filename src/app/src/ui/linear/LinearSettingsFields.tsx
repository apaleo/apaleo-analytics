import { useState } from 'react'
import { clearLinearApiKey, readLinearApiKey, writeLinearApiKey } from '../../persistence/linearKey.ts'
import { useI18n } from '../i18n.tsx'

const LINEAR_NEW_API_KEY_URL = 'https://linear.app/apaleocom/settings/account/security/api-keys/new'

/** Settings fields for the personal Linear API key. The key is not shown in the clear. */
export function LinearSettingsFields() {
  const { t } = useI18n()
  const [value, setValue] = useState(() => readLinearApiKey() ?? '')
  const [note, setNote] = useState<'saved' | 'cleared' | 'failed' | null>(null)

  return (
    <div className="menu__field">
      <div className="linear-key__heading">
        <p className="menu__label" id="linear-api-key-label">
          {t('linearApiKey')}
        </p>
        <a
          className="linear-key__create"
          href={LINEAR_NEW_API_KEY_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('linearCreateApiKey')}
        </a>
      </div>
      <p className="linear-key__warning">{t('linearApiKeyWarning')}</p>
      <input
        className="linear-key__input"
        type="password"
        name="linear-api-key"
        autoComplete="off"
        spellCheck={false}
        aria-labelledby="linear-api-key-label"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setNote(null)
        }}
      />
      <div className="linear-key__actions">
        <button
          type="button"
          className="linear-key__button linear-key__button--primary"
          onClick={() => {
            const result = writeLinearApiKey(value)
            if (result === 'saved') {
              setValue(readLinearApiKey() ?? '')
              setNote('saved')
              return
            }
            if (result === 'cleared') {
              setValue('')
              setNote('cleared')
              return
            }
            setNote('failed')
          }}
        >
          {t('linearSaveKey')}
        </button>
        <button
          type="button"
          className="linear-key__button"
          onClick={() => {
            clearLinearApiKey()
            setValue('')
            setNote('cleared')
          }}
        >
          {t('linearClearKey')}
        </button>
      </div>
      {note === 'saved' ? <p className="menu__note">{t('linearKeySaved')}</p> : null}
      {note === 'cleared' ? <p className="menu__note">{t('linearKeyCleared')}</p> : null}
      {note === 'failed' ? <p className="linear-error">{t('linearKeySaveFailed')}</p> : null}
    </div>
  )
}
