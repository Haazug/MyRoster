'use client'
import Brasileirinho from '@/components/Brasileirinho'
import {usePageQuery} from '@/lib/use-page-query'
import BackLink from '@/components/BackLink'

import Link from 'next/link'
import { useT } from '@/lib/i18n'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useMapStore, type Point } from '@/lib/map-store'
import { AirlineLogo } from '@/components/AirlineLogo'
import LiveFlights from '@/components/LiveFlights'
import AirlineAbout from '@/components/AirlineAbout'
import { CustomRoutes } from '@/components/CustomRoutes'
import { Flag } from '@/components/Flag'
import { fixName } from '@/lib/airline-names'
import AirlineFav from '@/components/AirlineFav'
import { useFavourites } from '@/lib/use-favourites'
import { useFavs } from '@/lib/use-favs'
import { useLocalStorage } from '@/lib/use-local-storage'
import SeenRoutes from '@/components/SeenRoutes'

const fetcher = (url: string) => fetch(url).then((response) => response.json())

type Airport = { iata?: string; name?: string; city?: string; country?: string; lat?: number; lon?: number }
type Route = { from: string; to: string; fromAirport?: Airport; toAirport?: Airport; aircraft?: string[]; roundTrip?: boolean }
type Airline = { name: string; iata?: string; icao?: string; country?: string; active?: boolean; alliance?:string }
type Tab = 'all' | 'domestic' | 'international'

const isDomestic = (r: Route) => !!r.fromAirport?.country && r.fromAirport.country === r.toAirport?.country

function AirlineDetailPage() {
  const tr=useT()
  const { id } = useParams<{ id: string }>()
  const { data, error } = useSWR(id ? `/api/airlines/${id}` : null, fetcher)
  const setView = useMapStore((s) => s.setView)
  const [q, setQ] = usePageQuery()
  const [tab, setTab] = useState<Tab>('all')
  const favR = useFavourites()
  const favAp = useFavs('airport')
  const [customAll] = useLocalStorage<any[]>('myroster.customRoutes', [])
  const [seenAll] = useLocalStorage<any[]>('myroster.seenRoutes', [])
  const extraSig = [...customAll, ...seenAll].map((r: any) => `${r.id}${r.fromPt ? '+' : '-'}`).join('|')

  useEffect(() => {
    if (!data?.routes) return
    const routes = (data.routes as Route[])
      .filter((r) => r.fromAirport?.lat != null && r.toAirport?.lat != null)
      .map((r) => ({ from: r.fromAirport as Point, to: r.toAirport as Point }))
    const key = String(data?.airline?.iata || id)
    const extra = [...customAll, ...seenAll].filter((r: any) => r.airlineKey === key && Number.isFinite(r.fromPt?.lat) && Number.isFinite(r.toPt?.lat)).map((r: any) => ({ from: r.fromPt as Point, to: r.toPt as Point }))
    setView({ mode: 'airline', routes: [...routes, ...extra], hubs:data.hubs })
    return () => setView({ mode: 'idle' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, setView, extraSig])

  const allRoutes = useMemo(() => {
    const seen = new Set<string>()
    return ((data?.routes as Route[]) || []).filter((r) => {
      const k = [r.from, r.to].sort().join('-')
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [data])

  const counts = useMemo(() => {
    const dom = allRoutes.filter(isDomestic).length
    return { all: allRoutes.length, domestic: dom, international: allRoutes.length - dom }
  }, [allRoutes])

  const nq = q.trim().toLowerCase()
  const filtered = useMemo(() => {
    const byTab = tab === 'all' ? allRoutes : allRoutes.filter((r) => (tab === 'domestic') === isDomestic(r))
    if (!nq) return byTab
    return byTab.filter((r) =>
      [r.from, r.to, r.fromAirport?.city, r.toAirport?.city, r.fromAirport?.name, r.toAirport?.name, r.fromAirport?.country, r.toAirport?.country]
        .filter(Boolean).join(' ').toLowerCase().includes(nq)
    )
  }, [allRoutes, tab, nq])

  const airKey = String(data?.airline?.iata || id)
  const routes = useMemo(() => {
    const score = (r: Route) =>
      (favR.items.some((f) => f.airlineIata === airKey && ((f.orig === r.from && f.dest === r.to) || (f.orig === r.to && f.dest === r.from))) ? 2 : 0) +
      (favAp.has(r.from) || favAp.has(r.to) ? 1 : 0)
    return [...filtered].sort((a, b) => score(b) - score(a))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, favR.items, favAp.items, airKey])

  if (error || data?.error) {
    return (
      <section className="min-h-screen p-5 sm:p-8">
        <BackLink href="/airlines" className="inline-flex min-h-11 items-center gap-2 text-sm text-white/55 hover:text-white">
          <ArrowLeft className="size-4" /> {tr('airlines.back')}
        </BackLink>
        <div className="mt-10 rounded-2xl border border-red-400/20 bg-red-400/10 p-5 text-red-100">{tr('airlines.error')}</div>
      </section>
    )
  }

  if (!data) return <section className="min-h-screen p-5 text-white/45 sm:p-8">{tr('airlines.loading')}</section>

  const airline = data.airline as Airline
  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: tr('live.all') },
    { key: 'domestic', label: tr('airlines.domestic') },
    { key: 'international', label: tr('airlines.international') },
  ]

  return (
    <section className="min-h-screen p-5 pb-32 sm:p-8">
      <BackLink href="/airlines" className="inline-flex min-h-11 items-center gap-2 text-sm text-white/55 hover:text-white">
        <ArrowLeft className="size-4" /> {tr('airlines.back')}
      </BackLink>
      <header className="mt-8 border-b border-white/10 pb-7">
        <div className="flex items-start gap-4">
          <AirlineLogo iata={airline.iata} icao={airline.icao} name={airline.name} size="lg" showText={false} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#55a7ff]">{tr('airlines.directory')}</p>
            <h1 className="board-display mt-2 text-3xl font-semibold tracking-tight">{fixName(airline.name)}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-white/45">
              <Flag country={airline.country} size={24} />
              {airline.country} · {tr('airlines.routes',{n:counts.all})} · {airline.icao}
            </p>
          </div>
        </div>
      </header>
      <p className="mt-4 text-xs text-white/45">{airline.alliance}</p><p className="mt-3 text-xs text-amber-200/60">{tr('catalog.reference')}</p><LiveFlights airline={airline.icao || airline.iata} />
      <AirlineAbout id={String(id)} />
      <AirlineFav />
      <CustomRoutes airlineKey={airline.iata || id} />
      <SeenRoutes airlineKey={airline.iata || id} iata={airline.iata} icao={airline.icao} known={allRoutes.map((r) => [r.from, r.to].sort().join('-'))} />

      <p className="board-heading mt-7 text-xs">{tr('airlines.fromHubs')}</p>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-11 shrink-0 px-3 text-sm font-medium transition ${tab === t.key ? 'border-b border-white text-white' : 'border-b border-transparent text-white/40 hover:text-white'}`}
          >
            {t.label} <span className={tab === t.key ? 'text-white/60' : 'text-white/30'}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('airlines.routeSearch')} className="mt-4 min-h-12 w-full rounded-2xl border border-white/10 bg-white/[.06] px-4 outline-none placeholder:text-white/35 focus:border-[#1f88ff]" />
      {(nq || tab !== 'all') && <p className="mt-3 text-xs text-white/40">{routes.length} of {counts.all} routes</p>}

      <div className="mt-4 flex flex-col divide-y divide-white/[.06] departure-board">
        {routes.map((route) => {
          const from = route.fromAirport
          const to = route.toAirport
          const dom = isDomestic(route)
          return (
            <Link key={`${route.from}-${route.to}`} href={`/route/${airline.iata || id}/${route.from}-${route.to}`} className="flex items-center gap-3 py-4 transition hover:bg-white/[.02]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 font-mono font-medium tracking-wide board-code">
                  <span>{route.from}</span><span className="text-white/30">→</span><span>{route.to}</span>
                  {tab === 'all' && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${dom ? 'border-white/20 text-white/50' : 'border-[#1f88ff]/40 text-[#55a7ff]'}`}>{tr(dom?'airlines.domestic':'airlines.international')}</span>}
                </div>
                <p className="mt-1 flex items-center gap-2 truncate text-sm text-white/45">
                  <Flag country={from?.country} size={16} />
                  <span className="truncate">{from?.city || from?.name || 'Origin'}</span>
                  <span>→</span>
                  <Flag country={to?.country} size={16} />
                  <span className="truncate">{to?.city || to?.name || 'Destination'}</span>
                </p>
                {route.aircraft?.length ? <p className="mt-2 text-xs text-white/30">{route.aircraft.join(', ')}</p> : null}
              </div>
              <ChevronRight className="size-5 shrink-0 text-white/30" />
            </Link>
          )
        })}
        {!routes.length && <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-white/40">{tr('live.noMatch')}</p>}
      </div>
    </section>
  )
}

export default function AirlinePage(){const {id}=useParams<{id:string}>();return id==='brasileirinho'?<Brasileirinho/>:<AirlineDetailPage/>}
