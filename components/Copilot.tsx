'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { MessageCircle, Send, X } from 'lucide-react'
import { useT, useLang } from '@/lib/i18n'
import { useMapStore } from '@/lib/map-store'
import { useLocalStorage } from '@/lib/use-local-storage'
import { estimateBlockMinutes } from '@/lib/flight-time'
import { routeMinutes, nmBetween } from '@/lib/time-match'

type Msg = { role: 'user' | 'assistant'; content: string }
const fetcher = (u: string) => fetch(u).then((r) => r.json())
const hm = (m: number) => (m ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : '?')

export default function Copilot() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const path = usePathname() || ''
  const exploring = useMapStore((s) => s.exploring)
  const [custom] = useLocalStorage<any[]>('myroster.customRoutes', [])
  const [seen] = useLocalStorage<any[]>('myroster.seenRoutes', [])
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [queued, setQueued] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const m = path.match(/^\/airlines\/([^/]+)/)
  const airlineId = m ? decodeURIComponent(m[1]) : null
  const { data, isLoading: l1 } = useSWR(open && airlineId ? `/api/airlines/${airlineId}` : null, fetcher)
  const { data: airlines, isLoading: l2 } = useSWR(open && !airlineId ? '/api/airlines' : null, fetcher)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, open, busy])

  // rotas do utilizador (adicionadas por ele ou vistas ao vivo), com distância e tempo estimado
  const mine = (key?: string) => {
    const rows = [...custom.map((r) => ({ ...r, kind: 'added by user' })), ...seen.map((r) => ({ ...r, kind: 'seen live' }))]
      .filter((r) => r && r.from && r.to && (!key || r.airlineKey === key))
    return rows.slice(0, 30).map((r: any) => {
      const nm = Number.isFinite(r.distanceNm) ? r.distanceNm : nmBetween(r.fromPt, r.toPt)
      const min = nm ? estimateBlockMinutes(nm, '') : 0
      return `${r.from}-${r.to} (${r.fromCity || ''} to ${r.toCity || ''}, about ${hm(min)}, ${nm || '?'} nm, ${r.kind}${r.flight ? `, flight ${r.flight}` : ''}${r.airlineName && !key ? `, ${r.airlineName}` : ''})`
    })
  }

  const context = (() => {
    if (airlineId && data?.airline) {
      const rs = (data.routes || []).slice(0, 80).map((r: any) => {
        const { min, nm } = routeMinutes(r)
        return `${r.from}-${r.to} (${r.fromAirport?.city || ''} to ${r.toAirport?.city || ''}, about ${hm(min)}, ${nm} nm)`
      })
      const um = mine(data.airline.iata || airlineId)
      return `Airline: ${data.airline.name} (${data.airline.iata || ''}). Hubs: ${(data.hubs || []).map((h: any) => h.iata).join(', ')}. Routes: ${rs.join('; ')}.${um.length ? ` Routes of this airline added or seen by the user: ${um.join('; ')}.` : ''}`
    }
    const list: any[] = Array.isArray(airlines) ? airlines : []
    const top = list.filter((a) => a.active && a.numRoutes > 0).sort((a, b) => b.numRoutes - a.numRoutes).slice(0, 60).map((a) => `${a.name} (${a.iata || a.icao}, ${a.country || ''}, ${a.numRoutes} routes)`)
    const um = mine()
    return `${top.length ? `No airline page is open. Airlines in the catalog: ${top.join('; ')}.` : `Page: ${path}.`}${um.length ? ` Routes saved by the user: ${um.join('; ')}.` : ''}`
  })()

  const send = async (override?: string) => {
    const raw = (override ?? text).trim()
    const content = (raw.replace(/^copilot[\s,:;-]*/i, '') || raw).slice(0, 600)
    if (!content || busy) return
    const next: Msg[] = [...msgs, { role: 'user', content }]
    setMsgs(next); setText(''); setBusy(true); setErr('')
    try {
      const r = await fetch('/api/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.slice(-8), context, lang }) })
      const d = await r.json().catch(() => ({}))
      if (r.status === 429) setErr(t('copilot.limit'))
      else if (!r.ok || !d.reply) setErr(t('copilot.unavailable'))
      else setMsgs([...next, { role: 'assistant', content: String(d.reply) }])
    } catch {
      setErr(t('copilot.error'))
    }
    setBusy(false)
  }

  // a Pesquisa pode abrir o copiloto com uma pergunta ("copilot ...")
  useEffect(() => {
    const h = (e: Event) => {
      const tx = String((e as CustomEvent).detail?.text || '').trim()
      setOpen(true)
      if (tx) setQueued(tx)
    }
    window.addEventListener('myroster:copilot', h)
    return () => window.removeEventListener('myroster:copilot', h)
  }, [])
  useEffect(() => {
    if (!queued || !open || busy || l1 || l2) return
    const tx = queued
    setQueued('')
    void send(tx)
  })

  if (exploring || path.includes('/fly')) return null
  return (
    <>
      {!open && (
        <button type="button" aria-label={t('copilot.open')} onClick={() => setOpen(true)} className="fixed bottom-24 right-4 z-50 flex size-12 items-center justify-center rounded-full bg-white text-black shadow-lg sm:bottom-6">
          <MessageCircle className="size-5" />
        </button>
      )}
      {open && (
        <div role="dialog" aria-label={t('copilot.title')} className="fixed bottom-24 right-4 z-50 flex h-[min(70dvh,32rem)] w-[min(92vw,23rem)] flex-col rounded-3xl bg-[#111] shadow-2xl ring-1 ring-white/10 sm:bottom-6">
          <div className="flex items-center justify-between px-4 pt-4">
            <p className="text-sm font-semibold">{t('copilot.title')}</p>
            <button type="button" aria-label={t('copilot.close')} onClick={() => setOpen(false)} className="p-1 text-white/50 hover:text-white"><X className="size-4" /></button>
          </div>
          <div className="mt-2 flex-1 space-y-3 overflow-y-auto px-4 pb-2 text-sm">
            <p className="rounded-2xl bg-white/[.06] px-3 py-2 text-white/70">{t('copilot.hello')}</p>
            {msgs.map((x, i) => (
              <p key={i} className={x.role === 'user' ? 'ml-8 rounded-2xl bg-white px-3 py-2 text-black' : 'mr-8 whitespace-pre-wrap rounded-2xl bg-white/[.06] px-3 py-2 text-white/80'}>{x.content}</p>
            ))}
            {busy && <p className="text-xs text-white/40">…</p>}
            {err && <p className="text-xs text-red-300">{err}</p>}
            <div ref={end} />
          </div>
          <p className="px-4 text-[10px] leading-tight text-white/30">{t('copilot.privacy')}</p>
          <div className="flex gap-2 p-3">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send() }} maxLength={600} placeholder={t('copilot.placeholder')} className="min-h-11 min-w-0 flex-1 rounded-full bg-white/[.06] px-4 text-sm outline-none placeholder:text-white/35" />
            <button type="button" aria-label={t('copilot.send')} onClick={() => void send()} disabled={busy || !text.trim()} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-black disabled:opacity-40"><Send className="size-4" /></button>
          </div>
        </div>
      )}
    </>
  )
}
