'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { useLocalStorage } from '@/lib/use-local-storage'
import { observedRouteNumbers } from '@/lib/route-number-memory'
import { Flag } from '@/components/Flag'
import { useT } from '@/lib/i18n'
import { pt, askPersist } from '@/lib/custom-route'

type Seen = { id: string; airlineKey: string; from: string; to: string; fromCity?: string; toCity?: string; fromCountry?: string; toCountry?: string; fromPt?: any; toPt?: any; flights: string[]; seenAt: number }
const pair = (a: string, b: string) => [a, b].sort().join('-')

export default function SeenRoutes({ airlineKey, iata, icao, known }: { airlineKey: string; iata?: string; icao?: string; known: string[] }) {
  const t = useT()
  const [seen, setSeen] = useLocalStorage<Seen[]>('myroster.seenRoutes', [])
  const [custom] = useLocalStorage<any[]>('myroster.customRoutes', [])
  const knownKey = known.join('|')

  useEffect(() => {
    let live = true
    const skip = new Set(known)
    custom.filter((r) => r.airlineKey === airlineKey).forEach((r) => skip.add(pair(r.from, r.to)))
    const have = new Set(seen.map((s) => s.id))
    observedRouteNumbers().then(async (rows) => {
      const groups = new Map<string, { from: string; to: string; flights: Set<string>; at: number }>()
      for (const n of rows) {
        if (!((icao && n.airlineIcao === icao) || (!icao && iata && n.airlineIata === iata))) continue
        const k = pair(n.from, n.to)
        if (skip.has(k)) continue
        const g = groups.get(k)
        if (!g) groups.set(k, { from: n.from, to: n.to, flights: new Set([n.number]), at: n.observedAt })
        else { g.flights.add(n.number); if (n.observedAt > g.at) { g.at = n.observedAt; g.from = n.from; g.to = n.to } }
      }
      const out: any[] = []
      let fetched = 0
      for (const [k, g] of Array.from(groups.entries())) {
        const id = `${airlineKey}:${k}`
        const base = { id, airlineKey, flights: Array.from(g.flights), seenAt: g.at }
        if (have.has(id)) { out.push(base); continue }
        if (fetched >= 15) continue
        fetched++
        try {
          const d = await fetch(`/api/route/${airlineKey}/${g.from}-${g.to}`).then((r) => r.json())
          if (!d || d.error || !d.from || !d.to) continue
          out.push({ ...base, from: d.from.iata || g.from, to: d.to.iata || g.to, fromCity: d.from.city, toCity: d.to.city, fromCountry: d.from.country, toCountry: d.to.country, fromPt: pt(d.from), toPt: pt(d.to) })
        } catch {}
      }
      if (!live || !out.length) return
      askPersist()
      setSeen((cur: Seen[]) => {
        const m = new Map<string, any>(cur.map((r) => [r.id, r] as [string, any]))
        for (const r of out) {
          const o = m.get(r.id)
          m.set(r.id, { ...(o || {}), ...r, flights: Array.from(new Set([...(o?.flights || []), ...r.flights])), seenAt: Math.max(o?.seenAt || 0, r.seenAt) })
        }
        return Array.from(m.values()).filter((r) => r.from && r.to)
      })
    }).catch(() => {})
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airlineKey, knownKey])

  const skipNow = new Set(known)
  custom.filter((r) => r.airlineKey === airlineKey).forEach((r) => skipNow.add(pair(r.from, r.to)))
  const mine = seen.filter((r) => r.airlineKey === airlineKey && r.from && r.to && !skipNow.has(pair(r.from, r.to))).sort((a, b) => b.seenAt - a.seenAt)
  if (!mine.length) return null
  return (
    <div className="mt-7">
      <p className="board-heading text-xs">{t('routes.seen')}</p>
      <div className="mt-3 flex flex-col divide-y divide-white/[.06] departure-board">
        {mine.map((r) => (
          <Link key={r.id} href={`/route/${airlineKey}/${r.from}-${r.to}`} className="flex items-center gap-3 py-4 transition hover:bg-white/[.02]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3 font-mono font-medium tracking-wide">
                <span>{r.from}</span><span className="text-white/30">→</span><span>{r.to}</span>
                <span className="rounded-full border border-white/20 px-2 py-0.5 font-sans text-[10px] font-medium uppercase tracking-wider text-white/50">{t('routes.seenOn', { date: new Date(r.seenAt).toLocaleDateString() })}</span>
              </div>
              <p className="mt-1 flex items-center gap-2 truncate text-sm text-white/45">
                <Flag country={r.fromCountry} size={16} />
                <span className="truncate">{r.fromCity || r.from}</span>
                <span>→</span>
                <Flag country={r.toCountry} size={16} />
                <span className="truncate">{r.toCity || r.to}</span>
              </p>
              {r.flights.length > 0 && <p className="mt-2 text-xs text-white/30">{r.flights.slice(0, 6).join(', ')}</p>}
            </div>
            <ChevronRight className="size-5 shrink-0 text-white/30" />
          </Link>
        ))}
      </div>
    </div>
  )
}
