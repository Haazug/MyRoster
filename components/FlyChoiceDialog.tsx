'use client'

import DialogSheet from '@/components/DialogSheet'
import { toast } from 'sonner'
import { Map, Plane, SlidersHorizontal, Download, X } from 'lucide-react'
import { copyText, downloadPln, flightSummary, simbriefUrl, type ExportFlight } from '@/lib/export'

export type FlyKind = 'simbrief' | 'volanta' | 'msfs' | 'manual'

// opens the external tool (must be called straight from a click)
export async function openExternal(kind: FlyKind, f: ExportFlight) {
  if (kind === 'simbrief') {
    window.open(simbriefUrl(f), '_blank', 'noopener,noreferrer')
  } else if (kind === 'volanta') {
    window.open('https://fly.volanta.app/map', '_blank', 'noopener,noreferrer')
    await copyText(flightSummary(f))
    toast('Flight details copied. In Volanta: Plan a Flight → Add a Flight Plan → Import from SimBrief.')
  } else if (kind === 'msfs') {
    window.open('https://planner.flightsimulator.com', '_blank', 'noopener,noreferrer')
    downloadPln(f)
    await copyText(flightSummary(f))
    toast('.pln downloaded and details copied. Load it in the planner or in the in-sim World Map.')
  }
}

const OPTIONS: { kind: FlyKind; icon: any; title: string; text: string; primary?: boolean }[] = [
  { kind: 'simbrief', icon: Plane, title: 'Plan it in SimBrief', text: 'Opens SimBrief in your browser with the flight pre-filled. This page moves on to the flight plan, where you can import the result.', primary: true },
  { kind: 'volanta', icon: Map, title: 'Plan it in Volanta', text: 'Copies the flight details and opens the Volanta map in your browser.' },
  { kind: 'msfs', icon: Download, title: 'MSFS Flight Planner', text: 'Downloads a .pln file and opens the planner in your browser.' },
  { kind: 'manual', icon: SlidersHorizontal, title: 'Plan it manually', text: 'Fill in the flight plan here, without leaving MyRoster.' },
]

export default function FlyChoiceDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (kind: FlyKind) => void }) {
  if (!open) return null
  return (
    <DialogSheet open={open} onClose={onClose} label="Plan your flight">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">Plan your flight</h2>
            <p className="mt-1 text-sm text-white/50">How do you want to prepare it?</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-1 text-white/50 hover:text-white"><X className="size-5" /></button>
        </div>
        {OPTIONS.map((o, i) => (
          <button
            key={o.kind}
            onClick={() => onPick(o.kind)}
            className={`w-full rounded-2xl p-4 text-left ${i === 0 ? 'mt-5' : 'mt-3'} ${o.primary ? 'bg-[#1f88ff]' : 'border border-white/15 bg-white/[.06]'}`}
          >
            <p className="flex items-center gap-2 font-semibold"><o.icon className="size-4" />{o.title}</p>
            <p className={`mt-1 text-sm ${o.primary ? 'text-white/80' : 'text-white/60'}`}>{o.text}</p>
          </button>
        ))}
    </DialogSheet>
  )
}
