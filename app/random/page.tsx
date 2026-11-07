'use client'
import { useT } from '@/lib/i18n'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { Shuffle } from 'lucide-react'
import { BoardingPass } from '@/components/BoardingPass'
import { estimateBlockMinutes } from '@/lib/flight-time'
import { AirlineLogo } from '@/components/AirlineLogo'
import { matchAirline } from '@/lib/airline-aliases'
import { fixName } from '@/lib/airline-names'
import { useFavs } from '@/lib/use-favs'
import { TOP_ICAO } from '@/lib/top-airlines'

type A = { id: string; name: string; iata: string; icao: string; active: boolean; numRoutes: number }
type Ap = { iata?: string; city?: string; name?: string; lat?: number; lon?: number }
type R = { from: string; to: string; fromAirport?: Ap; toAirport?: Ap; aircraft?: string[] }
type Result = { airline: A; route: R; nm: number; min: number }

const fetcher = (u: string) => fetch(u).then((r) => r.json())
const norm = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const BUCKETS = [['any','random.any'],['short','random.short'],['medium','random.medium'],['long','random.long']] as const

function nmBetween(a?: Ap, b?: Ap) {
  if (a?.lat == null || a?.lon == null || b?.lat == null || b?.lon == null) return 0
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return Math.round(2 * 3440.07 * Math.asin(Math.sqrt(h)))
}

export default function RandomPage() {
  const t=useT()
  const { data } = useSWR<A[]>('/api/airlines', fetcher)
  const list = Array.isArray(data) ? data : []
  const favA = useFavs('airline')
  const topList = TOP_ICAO.map((c) => list.filter((a) => a.icao === c).sort((x, y) => Number(y.active) - Number(x.active) || y.numRoutes - x.numRoutes)[0]).filter(Boolean) as A[]
  const quick = [...list.filter((a) => favA.has(a.id)), ...topList.filter((a) => !favA.has(a.id))].slice(0, 10)
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<A | null>(null)
  const [airport, setAirport] = useState('')
  const [time, setTime] = useState<'any' | 'short' | 'medium' | 'long'>('any')
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [res, setRes] = useState<Result | null>(null)

  const nq = norm(q.trim())
  const suggestions = nq && !chosen ? list.filter((a) => matchAirline(a, q.trim())).sort((x, y) => Number(favA.has(y.id)) - Number(favA.has(x.id)) || Number(y.active) - Number(x.active) || y.numRoutes - x.numRoutes).slice(0, 6) : []

  const generate = async () => {
    setBusy(true); setMsg(''); setRes(null)
    const airline = chosen || suggestions[0] || null
    const pool = airline ? [airline] : list.filter((a) => a.active && a.numRoutes > 0).sort(() => Math.random() - 0.5).slice(0, 15)
    const na = norm(airport.trim())
    const target = Number(custom) || 0
    for (const a of pool) {
      const d = await fetch(`/api/airlines/${a.id}`).then((r) => r.json()).catch(() => null)
      const routes: R[] = d?.routes || []
      const ok: Result[] = []
      for (const r of routes) {
        if (na && ![r.from, r.to, r.fromAirport?.city, r.toAirport?.city, r.fromAirport?.name, r.toAirport?.name].some((x) => norm(x || '').includes(na))) continue
        const nm = nmBetween(r.fromAirport, r.toAirport)
        const min = nm ? estimateBlockMinutes(nm, r.aircraft?.[0] || '') : 0
        if (target > 0 && min && Math.abs(min - target) > Math.max(10, target * 0.25)) continue
        if (!target && time !== 'any' && min) {
          if (time === 'short' && min >= 120) continue
          if (time === 'medium' && (min < 120 || min > 300)) continue
          if (time === 'long' && min <= 300) continue
        }
        ok.push({ airline: a, route: r, nm, min })
      }
      if (ok.length) { setRes(pick(ok)); setBusy(false); return }
    }
    setMsg(t('random.none'))
    setBusy(false)
  }

  const input = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#1f88ff]'

  return (
    <section className="min-h-screen p-5 pb-32 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#55a7ff]">{t('nav.random')}</p>
      <h1 className="mt-2 text-4xl font-semibold">{t('random.title')}</h1>

      <div className="mt-6 space-y-4">
        <div>
          <p className="mb-1 text-xs text-white/50">{t('live.airline')}</p>
          <input className={input} placeholder={t('random.any')} value={chosen ? fixName(chosen.name) : q} onChange={(e) => { setChosen(null); setQ(e.target.value) }} />
          {!chosen && !q && quick.length > 0 && (
            <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
              {quick.map((a) => (
                <button key={a.id} type="button" onClick={() => { setChosen(a); setQ(fixName(a.name)) }} className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-3 text-xs hover:border-[#1f88ff]/60">
                  <AirlineLogo iata={a.iata} icao={a.icao} name={fixName(a.name)} size="sm" showText={false} />
                  <span className="whitespace-nowrap">{fixName(a.name)}</span>
                </button>
              ))}
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((a) => (
                <button key={a.id} type="button" onClick={() => { setChosen(a); setQ(fixName(a.name)) }} className="flex items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-3 text-xs">
                  <AirlineLogo iata={a.iata} icao={a.icao} name={fixName(a.name)} size="sm" showText={false} />{fixName(a.name)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs text-white/50">{t('random.airport')}</p>
          <input className={input} placeholder={t('random.any')} value={airport} onChange={(e) => setAirport(e.target.value)} />
        </div>
        <div>
          <p className="mb-1 text-xs text-white/50">{t('random.time')}</p>
          <input className={input} type="number" min={5} placeholder={t('random.minutes')} value={custom} onChange={(e) => setCustom(e.target.value)} />
          <p className="mb-2 mt-3 text-xs text-white/40">{t('random.range')}</p>
          <div className="flex flex-wrap gap-2">
            {BUCKETS.map(([k, label]) => (
              <button key={k} onClick={() => setTime(k)} className={`rounded-xl border px-3 py-2 text-sm ${time === k ? 'border-[#1f88ff] bg-[#1f88ff]/20' : 'border-white/10 bg-white/5'}`}>{t(label)}</button>
            ))}
          </div>
        </div>
      </div>

      {msg && <p className="mt-4 text-sm text-red-300">{msg}</p>}

      {res && (
        <div className="mt-8">
          <BoardingPass
            data={{
              from: res.route.from, to: res.route.to, fromCity: res.route.fromAirport?.city, toCity: res.route.toAirport?.city,
              airline: res.airline.name, flight: undefined, aircraft: res.route.aircraft?.[0], distanceNm: res.nm,
              date: new Date().toISOString().slice(0, 10),
            }}
          />
          <Link href={`/route/${res.airline.iata || res.airline.id}/${res.route.from}-${res.route.to}`} className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-[#1f88ff] font-medium">
            {t('random.open')}
          </Link>
        </div>
      )}

      <button onClick={generate} disabled={busy || !list.length} className="mt-8 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-semibold text-black disabled:opacity-40">
        <Shuffle className="size-4" /> {busy ? t('random.searching') : res ? t('random.another') : t('random.generate')}
      </button>
    </section>
  )
}