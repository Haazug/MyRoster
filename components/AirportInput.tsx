"use client"

import { useEffect, useState } from "react"
import { useT } from "@/lib/i18n"

export type Ap = { iata: string; icao: string; city: string; name: string; country: string; lat: number; lon: number }

export function nmBetween(a: Pick<Ap,'lat'|'lon'>, b: Pick<Ap,'lat'|'lon'>) {
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return Math.round(2 * 3440.07 * Math.asin(Math.sqrt(h)))
}

export function AirportInput({ value, onChange, onResolve, className = "" }: {
  value: string
  onChange: (v: string) => void
  onResolve: (a: Ap | null) => void
  className?: string
}) {
  const t = useT()
  const [list, setList] = useState<Ap[]>([])
  const [picked, setPicked] = useState<Ap | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const q = value.trim()
    let live = true
    setDone(false)
    if (q.length < 2) { setList([]); setPicked(null); onResolve(null); return }
    const timer = setTimeout(() => {
      fetch(`/api/airport-search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!live) return
          const arr: Ap[] = Array.isArray(d) ? d : []
          const up = q.toUpperCase()
          const sel = arr.find((a) => a.iata === up || a.icao === up) || (arr.length === 1 ? arr[0] : null)
          setList(arr); setPicked(sel); onResolve(sel); setDone(true)
        })
        .catch(() => { if (live) { setList([]); setPicked(null); onResolve(null); setDone(true) } })
    }, 300)
    return () => { live = false; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div>
      <input className={className} placeholder={t("ap.ph")} value={value} onChange={(e) => onChange(e.target.value)} />
      {picked ? (
        <p className="mt-1 text-xs text-[#55a7ff]">✓ {picked.city} · {picked.iata}/{picked.icao}</p>
      ) : list.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {list.map((a) => (
            <button key={a.iata} type="button" onClick={() => onChange(a.iata)} className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-xs">{a.city} · {a.iata}</button>
          ))}
        </div>
      ) : done && value.trim().length >= 2 ? (
        <p className="mt-1 text-xs text-red-300">{t("ap.notFound")}</p>
      ) : null}
    </div>
  )
}
