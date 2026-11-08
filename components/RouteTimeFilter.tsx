'use client'
import { useT } from '@/lib/i18n'
const PRESETS = ['1', '2', '3', '5', '8', '12']
type P = { hours: string; onHours: (v: string) => void; precise: boolean; onPrecise: (v: boolean) => void }
export default function RouteTimeFilter({ hours, onHours, precise, onPrecise }: P) {
  const t = useT()
  const chip = (on: boolean) => `min-h-9 rounded-full px-4 text-sm transition ${on ? 'bg-white font-medium text-black' : 'bg-white/[.06] text-white/60 hover:text-white'}`
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-white/40">{t('time.hours')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onHours('')} className={chip(!hours)}>{t('live.all')}</button>
        {PRESETS.map((h) => <button key={h} type="button" onClick={() => onHours(h)} className={chip(hours === h)}>{h}h</button>)}
        <input inputMode="decimal" value={hours} onChange={(e) => onHours(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 4))} placeholder="2.5" aria-label={t('time.hours')} className="min-h-9 w-20 rounded-full bg-white/[.06] px-4 text-sm outline-none placeholder:text-white/35" />
      </div>
      {hours !== '' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => onPrecise(true)} className={chip(precise)}>{t('time.exact')}</button>
          <button type="button" onClick={() => onPrecise(false)} className={chip(!precise)}>{t('time.approx')}</button>
        </div>
      )}
    </div>
  )
}
