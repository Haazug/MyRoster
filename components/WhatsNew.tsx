'use client'
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import { APP_VERSION } from '@/lib/release'

const KEY = 'myroster.seenRelease'
const NOTES = ['release.n1', 'release.n2', 'release.n3', 'release.n4']

export default function WhatsNew() {
  const t = useT()
  const [open, setOpen] = useState(false)
  useEffect(() => { try { if (localStorage.getItem(KEY) !== APP_VERSION) setOpen(true) } catch {} }, [])
  if (!open) return null
  const close = () => { try { localStorage.setItem(KEY, APP_VERSION) } catch {} setOpen(false) }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="whatsnew-title" className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-[#111] p-6">
        <h2 id="whatsnew-title" className="text-xl font-semibold">{t('release.title')}</h2>
        <ul className="mt-4 space-y-2 text-sm text-white/70">
          {NOTES.map((k) => <li key={k}>• {t(k)}</li>)}
          <li className="text-white/40">• {t('release.bugs')}</li>
        </ul>
        <button type="button" onClick={close} className="mt-6 min-h-11 w-full rounded-full bg-white text-sm font-semibold text-black">{t('release.ok')}</button>
      </div>
    </div>
  )
}
