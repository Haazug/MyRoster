'use client'
import { useT } from '@/lib/i18n'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { Shuffle } from 'lucide-react'
import { BoardingPass } from '@/components/BoardingPass'
import { AirlineLogo } from '@/components/AirlineLogo'
import RouteTimeFilter from '@/components/RouteTimeFilter'
import { matchAirline } from '@/lib/airline-aliases'
import { fixName } from '@/lib/airline-names'
import { useFavs } from '@/lib/use-favs'
import { TOP_ICAO } from '@/lib/top-airlines'
import { routeMinutes, matchesTime, parseHours } from '@/lib/time-match'

type A = { id: string; name: string; iata: string; icao: string; active: boolean; numRoutes: number }
type Ap = { iata?: string; city?: string; name?: string; lat?: number; lon?: number }
type R = { from: string; to: string; fromAirport?: Ap; toAirport?: Ap; aircraft?: string[] }
type Result = { airline: A; route: R; nm: number; min: number }

const fetcher = (u: string) => fetch(u).then((r) => r.json())
const norm = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

export default function RandomPage() {
  const t = useT()
  const { data } = useSWR<A[]>('/api/airlines', fetcher)
  const list = Array.isArray(data) ? data : []
  const favA = useFavs('airline')
  const topList = TOP_ICAO.map((c) => list.filter((a) => a.icao === c).sort((x, y) => Number(y.active) - Number(x.active) || y.numRoutes - x.numRoutes)[0]).filter(Boolean) as A[]
  const quick = [...list.filter((a) => favA.has(a.id)), ...topList.filter((a) => !favA.has(a.id))].slice(0, 10)
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<A | null>(null)
  const [airport, setAirport] = useState('')
  const [hours, setHours] = useState('')
  const [precise, setPrecise] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [res, setRes] = useState<Result | null>(null)

  const nq = norm(q.trim())
  const suggestions = nq && !chosen ? list.filter((a) => matchAirline(a, q.trim())).sort((x, y) => Number(favA.has(y.id)) - Number(favA.has(x.id)) || Number(y.active) - Number(x.active) || y.numRoutes - x.numRoutes).slice(0, 6) : []

  const generate = async () => {
    setBusy(true); setMsg(''); setRes(null)
    if (q.trim() && !chosen && !suggestions.length) { setMsg(t('random.noAirline')); setBusy(false); return }
    const airline = chosen || suggestions[0] || null
    const pool = airline ? [airline] : list.filter((a) => a.active && a.numRoutes > 0).sort(() => Math.random() - 0.5).slice(0, 15)
    const na = norm(airport.trim())
    const h = parseHours(hours)
    for (const a of pool) {
      const d = await fetch(`/api/airlines/${a.id}`).then((r) => r.json()).catch(() => null)
      const routes: R[] = d?.routes || []
      const ok: Result[] = []
      for (const r of routes) {
        if (na && ![r.from, r.to, r.fromAirport?.city, r.toAirport?.city, r.fromAirport?.name, r.toAirport?.name].some((x) => norm(x || '').includes(na))) continue
        const { nm, min } = routeMinutes(r)
        if (h > 0 && !matchesTime(r, h, precise)) continue
        ok.push({ airline: a, route: r, nm, min })
      }
      if (ok.length) { setRes(pick(ok)); setBusy(false); return }
    }
    setMsg(t('random.none'))
    setBusy(false)
  }

  const input = 'w-full rounded-2xl bg-white/[.06] px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:bg-white/10'
  const pill = 'flex items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-3 text-xs hover:border-[#1f88ff]/60'

  return (
    <section className="min-h-screen p-5 pb-32 sm:p-8">
      <p className="text-xs text-white/40">{t('nav.random')}</p>
      <h1 className="mt-2 text-4xl font-semibold">{t('random.title')}</h1>

      <div className="mt-6 space-y-5">
        <div>
          <p className="mb-1 text-xs text-white/50">{t('live.airline')}</p>
          <input className={input} placeholder={t('random.any')} value={chosen ? fixName(chosen.name) : q} onChange={(e) => { setChosen(null); setQ(e.target.value) }} />
          {!chosen && !q && quick.length > 0 && (
            <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
              {quick.map((a) => (
                <button key={a.id} type="button" onClick={() => { setChosen(a); setQ(fixName(a.name)) }} className={`${pill} shrink-0`}>
                  <AirlineLogo iata={a.iata} icao={a.icao} name={fixName(a.name)} size="sm" showText={false} />
                  <span className="whitespace-nowrap">{fixName(a.name)}</span>
                </button>
              ))}
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((a) => (
                <button key={a.id} type="button" onClick={() => { setChosen(a); setQ(fixName(a.name)) }} className={pill}>
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
        <RouteTimeFilter hours={hours} onHours={setHours} precise={precise} onPrecise={setPrecise} />
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
