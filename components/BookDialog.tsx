'use client'

import { useRouter } from 'next/navigation'
import DialogSheet from '@/components/DialogSheet'
import {useT} from '@/lib/i18n'
import { X } from 'lucide-react'

export default function BookDialog({
  open,
  onClose,
  onSaveRoute,
  onPlan,
  planHref,
}: {
  open: boolean
  onClose: () => void
  onSaveRoute: () => void
  onPlan: () => void
  planHref: string
}) {
  const router = useRouter()
  const t=useT()
  if (!open) return null
  return (
    <DialogSheet open={open} onClose={onClose} label={t('booking.title')}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">{t('booking.title')}</h2>
            <p className="mt-1 text-sm text-white/50">{t('booking.question')}</p>
          </div>
          <button aria-label={t('booking.close')} onClick={onClose} className="flex size-11 shrink-0 items-center justify-center text-white/50 hover:text-white"><X className="size-5" /></button>
        </div>
        <button onClick={() => { onPlan(); onClose(); router.push(planHref) }} className="mt-5 w-full rounded-2xl bg-[#1f88ff] p-4 text-left">
          <p className="font-semibold">{t('booking.plan')}</p>
          <p className="mt-1 text-sm text-white/80">{t('booking.planHint')}</p>
        </button>
        <button onClick={() => { onSaveRoute(); onClose() }} className="mt-3 w-full rounded-2xl border border-white/15 bg-white/[.06] p-4 text-left">
          <p className="font-semibold">{t('booking.route')}</p>
          <p className="mt-1 text-sm text-white/60">{t('booking.routeHint')}</p>
        </button>
    </DialogSheet>
  )
}
