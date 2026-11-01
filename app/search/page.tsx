'use client'
import {usePageQuery} from '@/lib/use-page-query'

import Link from 'next/link'
import { useT } from '@/lib/i18n'
import {useMapStore} from '@/lib/map-store'
import { useMemo, useState, useEffect } from 'react'
import useSWR from 'swr'
import { Search, Star, X } from 'lucide-react'
import { AirlineLogo } from '@/components/AirlineLogo'
import LiveFlights from '@/components/LiveFlights'
import FlightNumberHit from '@/components/FlightNumberHit'
import { matchAirline } from '@/lib/airline-aliases'
import { fixName } from '@/lib/airline-names'
import { useFavs, useRecents } from '@/lib/use-favs'

const fetcher = (u: string) => fetch(u).then((r) => r.json())
const PAIR = /^([A-Za-z]{3})\s*(?:[-→>/]|\s)\s*([A-Za-z]{3})$/

export default function SearchPage() {
  const tr=useT()
  const setView=useMapStore(s=>s.setView)
  const [q, setQ] = usePageQuery()
  const t = q.trim()
  const { data: airlines } = useSWR<any[]>('/api/airlines', fetcher)
  const { data: airports } = useSWR<any[]>(t.length >= 2 ? `/api/airport-search?q=${encodeURIComponent(t)}` : null, fetcher)
  const favA = useFavs('airline')
  const favP = useFavs('airport')
  const rec = useRecents()

  const airlineHits = useMemo(() => {
    if (!t || !Array.isArray(airlines)) return []
    return airlines
      .filter((a) => matchAirline(a, t))
      .sort((x, y) => Number(favA.has(y.id)) - Number(favA.has(x.id)) || Number(y.active) - Number(x.active) || y.numRoutes - x.numRoutes)
      .slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, airlines, favA.items])
  const airportHits = useMemo(
    () => (Array.isArray(airports) ? [...airports].sort((x, y) => Number(favP.has(y.iata)) - Number(favP.has(x.iata))).slice(0, 8) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [airports, favP.items]
  )
  useEffect(()=>{setView(airportHits.length?{mode:'airports',airports:airportHits}:{mode:'idle'})},[airportHits,setView])
  useEffect(()=>()=>setView({mode:'idle'}),[setView])
  const routeQuery=t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  const routeKind=routeQuery.startsWith('transatlant')?'transatlantic':routeQuery.startsWith('transcontinent')?'transcontinental':'all'
  const isLive = /^(live(?: now)?|ao vivo|agora)$/i.test(t)||routeKind!=='all'
  const pair = t.match(PAIR)
  const row = 'flex items-center gap-3 py-3'
  const head = 'mt-8 text-xs font-medium text-white/40'

  return (
    <section className="min-h-screen p-5 pb-32 sm:p-8">
      <h1 className="text-4xl font-semibold">{tr('nav.search')}</h1>
      <label className="mt-6 flex min-h-12 items-center gap-3 rounded-2xl bg-white/[.06] px-4">
        <Search className="size-4 text-white/40" aria-hidden="true" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('search.placeholder')} className="min-h-11 w-full min-w-0 bg-transparent outline-none placeholder:text-white/35" />
        {q && <button type="button" aria-label={tr('search.clear')} onClick={() => setQ('')} className="text-white/40"><X className="size-4" /></button>}
      </label>

      {!t && <Link href="/live" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm text-white/65"><span className="size-1.5 rounded-full bg-green-400" />{tr('live.title')} · {tr('live.subtitle')}</Link>}
      {isLive && <LiveFlights key={routeKind} initialRouteType={routeKind} />}
      {!t && (
        <>
          {(favA.items.length > 0 || favP.items.length > 0) && (
            <>
              <p className={head}>{tr('search.favourites')}</p>
              <div className="divide-y divide-white/[.06]">
                {[...favA.items.map((f) => ({ ...f, k: 'airline' })), ...favP.items.map((f) => ({ ...f, k: 'airport' }))].map((f) => (
                  <Link key={`${f.k}:${f.id}`} href={f.href} className={row}>
                    <Star className="size-4 fill-[#facc15] text-[#facc15]" />
                    <span className="min-w-0 flex-1 truncate font-medium">{f.label}</span>
                    <span className="text-xs text-white/40">{f.sub}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
          {rec.items.length > 0 && (
            <>
              <div className="mt-8 flex items-center justify-between">
                <p className="text-xs font-medium text-white/40">{tr('search.recent')}</p>
                <button type="button" onClick={rec.clear} className="text-xs text-white/40 hover:text-white">{tr('search.clear')}</button>
              </div>
              <div className="divide-y divide-white/[.06]">
                {rec.items.map((r) => (
                  <Link key={r.id} href={r.href} className={row}>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
                    <span className="text-xs text-white/40">{r.sub}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
          {!favA.items.length && !favP.items.length && !rec.items.length && <p className="mt-8 text-sm text-white/40">{tr('search.try')}</p>}
        </>
      )}

      {t && !isLive && (
        <>
          <FlightNumberHit q={t} />
          {pair && (
            <Link href={`/routes/${pair[1].toUpperCase()}-${pair[2].toUpperCase()}`} className="mt-3 flex items-center justify-between rounded-2xl bg-white/[.04] p-4">
              <span className="font-semibold">{pair[1].toUpperCase()} ↔ {pair[2].toUpperCase()}</span>
              <span className="text-xs text-white/45">{tr('search.allRoutes')}</span>
            </Link>
          )}
          {airlineHits.length > 0 && <p className={head}>{tr('nav.airlines')}</p>}
          <div className="divide-y divide-white/[.06]">
            {airlineHits.map((a) => (
              <Link key={a.id} href={`/airlines/${a.id}`} onClick={() => rec.add({ id: `airline:${a.id}`, kind: 'airline', label: fixName(a.name), sub: [a.iata, a.icao].filter(Boolean).join(' · '), href: `/airlines/${a.id}` })} className={row}>
                <AirlineLogo iata={a.iata} icao={a.icao} name={fixName(a.name)} size="sm" showText={false} />
                <span className="min-w-0 flex-1 truncate font-medium">{fixName(a.name)}</span>
                {favA.has(a.id) && <Star className="size-4 fill-[#facc15] text-[#facc15]" />}
                <span className="text-xs text-white/40">{a.iata || a.icao}</span>
              </Link>
            ))}
          </div>
          {airportHits.length > 0 && <p className={head}>{tr('nav.airports')}</p>}
          <div className="divide-y divide-white/[.06]">
            {airportHits.map((a) => (
              <Link key={a.iata} href={`/airports/${a.iata}`} onClick={() => rec.add({ id: `airport:${a.iata}`, kind: 'airport', label: a.city || a.name, sub: a.name, href: `/airports/${a.iata}` })} className={row}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[.06] text-xs font-bold">{a.iata}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.city || a.name}</span><span className="block truncate text-xs text-white/40">{a.name}{a.country ? ` · ${a.country}` : ''}</span></span>
                {favP.has(a.iata) && <Star className="size-4 fill-[#facc15] text-[#facc15]" />}
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
