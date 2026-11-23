import { useEffect, type ReactNode } from 'react'

export function NoticeDialog({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string
  closeLabel: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="notice" onClick={onClose}>
      <div
        className="notice__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="notice-title">{title}</h2>
        <div className="notice__body">{children}</div>
        <button type="button" className="notice__close" onClick={onClose} autoFocus>
          {closeLabel}
        </button>
      </div>
    </div>
  )
}
