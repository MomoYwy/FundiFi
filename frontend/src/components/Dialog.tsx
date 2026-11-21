import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Dialog({ title, onClose, children, drawer = false }: {
  title: string
  onClose: () => void
  children: ReactNode
  drawer?: boolean
}) {
  const container = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = container.current
    panel?.focus()
    const onKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      if (dialogs[dialogs.length - 1] !== panel) return
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab' || !panel) return
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
      if (!controls.length) { event.preventDefault(); panel.focus(); return }
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const activeDialog = document.activeElement?.closest('[role="dialog"][aria-modal="true"]')
      if (!activeDialog || activeDialog === panel) previous?.focus()
    }
  }, [])

  return createPortal(<div className={`dialog-overlay${drawer ? ' drawer-overlay' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={container} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={drawer ? 'dialog-panel drawer-panel' : 'dialog-panel'}>
      <header className="dialog-header"><h2>{title}</h2><button className="secondary" type="button" aria-label={`Close ${title}`} onClick={onClose}>Close</button></header>
      {children}
    </section>
  </div>, document.body)
}
