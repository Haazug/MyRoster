'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { Trash2 } from 'lucide-react'
import { useLocalStorage } from '@/lib/use-local-storage'
import { matchAirline } from '@/lib/airline-aliases'
import { fixName } from '@/lib/airline-names'
import { AirlineLogo } from '@/components/AirlineLogo'
import { pt, askPersist } from '@/lib/custom-route'

const fetcher = (u: string) => fetch(u).then((r) => r.json())

export default function AirportAddRoute({ code }: { code: string }) {
  const [all, setAll] = useLocalStorage<any[]>('myroster.customRoutes', [])
  const { data } = useSWR<any[]>('/api/airlines', fetcher)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [airline, setAirline] = useState<any>(null)
  const [other, setOther] = useState('')
  const [flight, setFlight] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const mine = all.filter((r) => r.from === code || r.to === code)
  const options = q && !airline && Array.isArray(data)
    ? data.filter((a) => matchAirline(a, q)).sort((x, y) => Number(y.active) - Number(x.active) || y.numRoutes - x.numRoutes).slice(0, 6)
    : []

  const add = async () => {
    const o = other.trim().toUpperCase()
    if (!airline) return setMsg('Choose an airline.')
    if (!/^[A-Z]{3}$/.test(o) || o === code) return setMsg('Use a different 3-letter IATA code for the other airport.')
    const key = airline.iata || airline.id
    if (all.some((r) => r.airlineKey === key && ((r.from === code && r.to === o) || (r.from === o && r.to === code)))) return setMsg('Already added.')
    setBusy(true)
    setMsg('')
    try {
      const d = await fetch(`/api/route/${key}/${code}-${o}`).then((r) => r.json())
      if (!d || d.error || !d.from || !d.to) setMsg('Airport not found.')
      else {
        setAll((cur) => [...cur, { id: `${key}-${code}-${o}`, airlineKey: key, airlineName: fixName(airline.name), from: d.from.iata, to: d.to.iata, fromCity: d.from.city, toCity: d.to.city, distanceNm: d.distanceNm, flight: flight.trim().toUpperCase() || undefined, fromPt: pt(d.from), toPt: pt(d.to), fromCountry: d.from.country, toCountry: d.to.country }])
        askPersist()
        setOther(''); setFlight(''); setAirline(null); setQ(''); setOpen(false)
      }
    } catch {
      setMsg('Could not check the airports. Try again.')
    }
    setBusy(false)
  }

  const inp = 'min-h-11 w-full rounded-xl bg-white/[.06] px-3 text-sm outline-none placeholder:text-white/35 focus:bg-white/10'
  return (
    <div className="mt-8">
      <button type="button" onClick={() => setOpen(!open)} className="text-sm text-[#55a7ff]">{open ? 'Close' : '+ Add a route flown by an airline'}</button>
      {open && (
        <div className="mt-3 space-y-3 rounded-2xl bg-white/[.04] p-4">
          <input className={inp} placeholder="Airline (name or code)" value={airline ? fixName(airline.name) : q} onChange={(e) => { setAirline(null); setQ(e.target.value) }} />
          {options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {options.map((a) => (
                <button key={a.id} type="button" onClick={() => { setAirline(a); setQ(fixName(a.name)) }} className="flex items-center gap-2 rounded-full bg-white/[.06] py-1 pl-1 pr-3 text-xs">
                  <AirlineLogo iata={a.iata} icao={a.icao} name={fixName(a.name)} size="sm" showText={false} />{fixName(a.name)}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input className={`${inp} uppercase placeholder:normal-case`} placeholder={`${code} ↔ (IATA)`} maxLength={3} value={other} onChange={(e) => setOther(e.target.value)} />
            <input className={`${inp} uppercase placeholder:normal-case`} placeholder="Flight no. (optional)" value={flight} onChange={(e) => setFlight(e.target.value)} />
            <button type="button" onClick={add} disabled={busy} className="shrink-0 rounded-full bg-white px-5 text-sm font-semibold text-black disabled:opacity-40">Add</button>
          </div>
          {msg && <p className="text-xs text-red-300">{msg}</p>}
          <p className="text-xs text-white/35">Saved to your account. It appears here and on the airline page.</p>
        </div>
      )}
      {mine.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs text-white/40">Your routes here</p>
          <div className="divide-y divide-white/[.06]">
            {mine.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2">
                <Link href={`/route/${r.airlineKey}/${r.from}-${r.to}`} className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{r.from} ↔ {r.to}</span>
                  <span className="ml-2 text-xs text-white/45">{r.airlineName || r.airlineKey}{r.flight ? ` · ${r.flight}` : ''}</span>
                </Link>
                <button type="button" aria-label="Delete route" onClick={() => setAll((cur) => cur.filter((x) => x.id !== r.id))} className="p-2 text-white/40 hover:text-white"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
