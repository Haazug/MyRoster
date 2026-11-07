'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useLocalStorage } from '@/lib/use-local-storage'
import { Flag } from '@/components/Flag'
import { useT } from '@/lib/i18n'
import { pt, askPersist } from '@/lib/custom-route'

type Custom = { id: string; airlineKey: string; airlineName?: string; from: string; to: string; fromCity: string; toCity: string; distanceNm: number; flight?: string; fromPt?: any; toPt?: any; fromCountry?: string; toCountry?: string }

export function CustomRoutes({ airlineKey }: { airlineKey: string }) {
  const t = useT()
  const [all, setAll] = useLocalStorage<Custom[]>('myroster.customRoutes', [])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [flight, setFlight] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const mine = all.filter((r) => r.airlineKey === airlineKey)

  // rotas antigas sem coordenadas: vai buscá-las para desenhar a linha azul no globo
  useEffect(() => {
    const miss = mine.filter((r) => !r.fromPt || !r.toPt)
    if (!miss.length) return
    let live = true
    Promise.all(miss.slice(0, 10).map(async (r) => {
      try {
        const d = await fetch(`/api/route/${airlineKey}/${r.from}-${r.to}`).then((x) => x.json())
        return { id: r.id, fromPt: pt(d.from), toPt: pt(d.to), fromCountry: d.from?.country, toCountry: d.to?.country }
      } catch { return null }
    })).then((res) => {
      if (!live) return
      const ok = res.filter((x: any) => x && x.fromPt && x.toPt) as any[]
      if (ok.length) setAll((cur) => cur.map((r) => { const u = ok.find((x) => x.id === r.id); return u ? { ...r, ...u } : r }))
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airlineKey, mine.length])

  const add = async () => {
    const a = from.trim().toUpperCase()
    const b = to.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(a) || !/^[A-Z]{3}$/.test(b) || a === b) return setMsg('Use two different 3-letter IATA codes (e.g. NBJ and GRU).')
    if (mine.some((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a))) return setMsg('You already added this route.')
    setBusy(true)
    setMsg('')
    try {
      const d = await fetch(`/api/route/${airlineKey}/${a}-${b}`).then((r) => r.json())
      if (!d || d.error || !d.from || !d.to) setMsg('Airport not found.')
      else {
        setAll((cur) => [...cur, { id: `${airlineKey}-${a}-${b}`, airlineKey, airlineName: d.airline?.name, from: d.from.iata, to: d.to.iata, fromCity: d.from.city, toCity: d.to.city, distanceNm: d.distanceNm, flight: flight.trim().toUpperCase() || undefined, fromPt: pt(d.from), toPt: pt(d.to), fromCountry: d.from.country, toCountry: d.to.country }])
        askPersist()
        setFrom(''); setTo(''); setFlight('')
      }
    } catch {
      setMsg('Could not check the airports. Try again.')
    }
    setBusy(false)
  }

  const inp = 'min-h-11 w-full rounded-xl bg-white/[.06] px-3 text-sm uppercase outline-none placeholder:normal-case placeholder:text-white/35 focus:bg-white/10'
  return (
    <div className="mt-7">
      <p className="board-heading text-xs">{t('routes.mine')}</p>
      {mine.length > 0 && (
        <div className="mt-3 flex flex-col divide-y divide-white/[.06] departure-board">
          {mine.map((r) => (
            <div key={r.id} className="flex items-center gap-1">
              <Link href={`/route/${r.airlineKey}/${r.from}-${r.to}`} className="flex min-w-0 flex-1 items-center gap-3 py-4 transition hover:bg-white/[.02]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 font-mono font-medium tracking-wide">
                    <span>{r.from}</span><span className="text-white/30">→</span><span>{r.to}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-2 truncate text-sm text-white/45">
                    <Flag country={r.fromCountry} size={16} />
                    <span className="truncate">{r.fromCity || r.from}</span>
                    <span>→</span>
                    <Flag country={r.toCountry} size={16} />
                    <span className="truncate">{r.toCity || r.to}</span>
                  </p>
                  <p className="mt-2 text-xs text-white/30">{r.flight ? `${r.flight} · ` : ''}{Number.isFinite(r.distanceNm) ? `${r.distanceNm.toLocaleString('en-US')} nm` : ''}</p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-white/30" />
              </Link>
              <button aria-label="Delete route" onClick={() => setAll((cur) => cur.filter((x) => x.id !== r.id))} className="p-2 text-white/40 hover:text-white"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <input className={inp} placeholder="From (NBJ)" maxLength={3} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className={inp} placeholder="To (GRU)" maxLength={3} value={to} onChange={(e) => setTo(e.target.value)} />
        <input className={inp} placeholder="Flight no." value={flight} onChange={(e) => setFlight(e.target.value)} />
        <button onClick={add} disabled={busy || !from || !to} className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-40"><Plus className="size-4" /></button>
      </div>
      {msg && <p className="mt-2 text-xs text-red-300">{msg}</p>}
    </div>
  )
}
