'use client'
import AllianceLogo from '@/components/AllianceLogo'
import {ALLIANCES} from '@/lib/alliances'
import {usePageQuery} from '@/lib/use-page-query'

import { useT } from '@/lib/i18n'
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { matchAirline } from '@/lib/airline-aliases'
import FlightNumberHit from '@/components/FlightNumberHit'
import { useFavs } from '@/lib/use-favs'
import { TOP_ICAO } from '@/lib/top-airlines'
import { fixName } from '@/lib/airline-names'
import Link from 'next/link'
import { ChevronRight, Search } from 'lucide-react'
import { AirlineLogo } from '@/components/AirlineLogo'

type Airline = { id: string; name: string; iata: string; icao: string; country: string; active: boolean; numRoutes: number; alliance?:string }
const fetcher = (u: string) => fetch(u).then((r) => r.json())
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function Airlines() {
  const tr=useT()
  const { data, error, mutate } = useSWR<Airline[] | { error: string }>('/api/airlines', fetcher)
  const [q, setQ] = usePageQuery()
  const [alliance,setAlliance]=useState('')
  const favA = useFavs('airline')
  const list = Array.isArray(data) ? data : []
  const top = TOP_ICAO.map((c) => list.filter((a) => a.icao === c).sort((x, y) => Number(y.active) - Number(x.active) || y.numRoutes - x.numRoutes)[0]).filter(Boolean) as Airline[]
  const favList = list.filter((a) => favA.has(a.id))
  const rows = useMemo(() => {
    const n = norm(q.trim())
    const eligible=list.filter(a=>!alliance||a.alliance===alliance)
    const base = n ? eligible.filter((a) => matchAirline(a, q)||norm(a.alliance||'').includes(n)) : eligible
    return [...base].sort((x, y) => Number(favA.has(y.id)) - Number(favA.has(x.id)))
  }, [list, q, favA.items,alliance])

  return (
    <section className="min-h-screen p-5 sm:p-8">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#55a7ff]">{tr('airlines.directory')}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">{tr('airlines.title')}</h1>
        <p className="mt-2 text-white/45">{tr('airlines.subtitle')}</p>
        <Link href="/free" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-medium">{tr('nav.free')}</Link><Link href="/community" className="mt-4 ml-2 inline-flex min-h-11 items-center rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-medium">{tr('community.title')}</Link>
      </header>
      {(top.length > 0 || favList.length > 0) && !q && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-white/40">{tr('airlines.top')}</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {[...favList, ...top.filter((t) => !favA.has(t.id))].map((a) => (
              <Link key={a.id} href={`/airlines/${a.id}`} className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-transparent py-1.5 pl-1.5 pr-4 text-sm hover:border-[#1f88ff]/60">
                <AirlineLogo iata={a.iata} icao={a.icao} name={fixName(a.name)} size="sm" showText={false} />
                <span className="whitespace-nowrap">{fixName(a.name)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav aria-label={tr('airlines.alliance')} className="mb-5 flex flex-wrap gap-2">{ALLIANCES.map(a=><Link key={a.slug} href={`/alliances/${a.slug}`} className="flex min-h-11 items-center gap-2 rounded-full border border-white/10 px-3 text-xs"><AllianceLogo slug={a.slug} symbol={a.symbol} className="h-6" />{a.name}</Link>)}</nav>
      <label className="mb-5 flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-white/[.06] px-4">
        <Search className="size-4 text-white/40" aria-hidden="true" />
        <span className="sr-only">{tr('airlines.filter')}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11 w-full min-w-0 bg-transparent outline-none placeholder:text-white/35" placeholder={tr('airlines.filter')} />
      </label>
      <label className="mb-5 flex items-center gap-3 text-sm text-white/60"><span>{tr('airlines.alliance')}</span><select value={alliance} onChange={e=>setAlliance(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/70 px-3"><option value="">{tr('live.all')}</option>{['Star Alliance','SkyTeam','oneworld'].map(a=><option key={a}>{a}</option>)}</select></label><FlightNumberHit q={q} /><p className="mb-4 text-xs text-amber-200/60">{tr('catalog.reference')}</p>
      {error || (data && !Array.isArray(data)) ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 p-5">
          {tr('airlines.error')}
          <button onClick={() => mutate()} className="min-h-11 rounded-lg bg-white px-4 text-sm text-black">{tr('live.refresh')}</button>
        </div>
      ) : !data ? (
        <p className="text-white/40" aria-busy="true">{tr('airlines.loading')}</p>
      ) : (
        <div className="flex flex-col divide-y divide-white/[.06] departure-board">
          {rows.map((a) => (
            <Link href={`/airlines/${a.id}`} key={a.id} className="flex min-h-[76px] items-center gap-4 py-3 transition hover:bg-white/[.02]">
              <AirlineLogo iata={a.iata} icao={a.icao} name={fixName(a.name)} size="md" showText={false} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold board-code">{fixName(a.name)}</p>
                <p className="font-mono text-xs text-white/45">{a.id==='brasileirinho'?'PS-BZR':`${a.iata} / ${a.icao}`}  · {tr('airlines.routes',{n:a.numRoutes})}{a.alliance && <span className="ml-2 text-yellow-200/70">{a.alliance}</span>}{!a.active && <span className="ml-2 text-xs text-amber-300">{tr('airlines.historical')}</span>}</p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-white/30" aria-hidden="true" />
            </Link>
          ))}
          {!rows.length && <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-white/40">{tr('airlines.none')}</p>}
        </div>
      )}
    </section>
  )
}
