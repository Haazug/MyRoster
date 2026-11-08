'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { MessageCircle, Send, X } from 'lucide-react'
import { useT, useLang } from '@/lib/i18n'
import { useMapStore } from '@/lib/map-store'
import { useLocalStorage } from '@/lib/use-local-storage'
import { estimateBlockMinutes } from '@/lib/flight-time'
import { routeMinutes, nmBetween } from '@/lib/time-match'
import { AirlineLogo } from '@/components/AirlineLogo'
import { fixName } from '@/lib/airline-names'

type Msg = { role: 'user' | 'assistant'; content: string; fresh?: boolean }
const fetcher = (u: string) => fetch(u).then((r) => r.json())
const hm = (m: number) => (m ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : '?')
const MARK = /\[\[ROUTE:([A-Za-z]{3})-([A-Za-z]{3})\]\]\s*/

const inline = (s: string) =>
  s.replace(/\[\[ROUTE:[^\]]*\]\]/g, '').split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong> : p)

// botão "Abrir" ao lado de cada rota sugerida; se várias companhias a operam, deixa escolher
function RouteButton({ from, to, preferred, onGo }: { from: string; to: string; preferred: any; onGo: () => void }) {
  const t = useT()
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'pick'>('idle')
  const [airlines, setAirlines] = useState<any[]>([])
  const go = (a: any) => { onGo(); router.push(a ? `/route/${a.iata || a.id}/${from}-${to}` : `/routes/${from}-${to}`) }
  const click = async () => {
    if (preferred) return go(preferred)
    setState('loading')
    try {
      let found: any[] = []
      for (const [a, b] of [[from, to], [to, from]]) {
        const d = await fetch(`/api/airports/${a}`).then((r) => r.json())
        const r = (d?.routes || []).find((x: any) => x.to === b)
        if (r?.airlines?.length) { found = r.airlines; break }
      }
      if (found.length === 1) { setState('idle'); return go(found[0]) }
      if (found.length > 1) { setAirlines(found); setState('pick'); return }
      setState('idle'); go(null)
    } catch { setState('idle'); go(null) }
  }
  return (
    <span className="shrink-0">
      <button type="button" onClick={click} disabled={state === 'loading'} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black disabled:opacity-50">{state === 'loading' ? '…' : t('copilot.openRoute')}</button>
      {state === 'pick' && (
        <span className="mt-2 flex w-full flex-col gap-1">
          <span className="text-[10px] text-white/40">{t('copilot.chooseAirline')}</span>
          {airlines.slice(0, 8).map((a) => (
            <button key={a.id} type="button" onClick={() => go(a)} className="flex items-center gap-2 rounded-full border border-white/10 py-0.5 pl-0.5 pr-3 text-left text-xs hover:border-white/40">
              <AirlineLogo iata={a.iata} icao={a.icao} name={fixName(a.name)} size="sm" showText={false} />
              <span className="truncate">{fixName(a.name)}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

// mini-markdown: títulos, listas e negrito (sem bibliotecas)
function Rich({ text, preferred, onGo }: { text: string; preferred: any; onGo: () => void }) {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let bullets: ReactNode[] = []
  const flush = (k: number) => { if (bullets.length) { out.push(<ul key={'u' + k} className="space-y-2">{bullets}</ul>); bullets = [] } }
  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    const h = line.match(/^#{1,4}\s+(.*)$/)
    const b = line.match(/^\s*[-*•]\s+(.*)$/) || line.match(/^\s*(\[\[ROUTE:.*)$/)
    if (h) { flush(i); out.push(<p key={i} className="mt-3 text-[13px] font-semibold text-white first:mt-0">{inline(h[1])}</p>) }
    else if (b) {
      const r = b[1].match(MARK)
      if (r) {
        const from = r[1].toUpperCase(), to = r[2].toUpperCase(), rest = b[1].replace(MARK, '')
        bullets.push(<li key={i} className="flex items-start gap-2"><span className="min-w-0 flex-1"><span className="font-mono font-semibold text-white">{from} → {to}</span> {inline(rest)}</span><RouteButton from={from} to={to} preferred={preferred} onGo={onGo} /></li>)
      } else bullets.push(<li key={i} className="flex gap-2"><span className="text-white/30">•</span><span>{inline(b[1])}</span></li>)
    }
    else if (line.trim()) { flush(i); out.push(<p key={i}>{inline(line)}</p>) }
    else flush(i)
  })
  flush(lines.length)
  return <div className="space-y-2">{out}</div>
}

// efeito de escrita, como no ChatGPT
function Typewriter({ text, animate, onTick, onDone, render }: { text: string; animate: boolean; onTick: () => void; onDone: () => void; render: (s: string) => ReactNode }) {
  const [n, setN] = useState(animate ? 0 : text.length)
  useEffect(() => {
    if (n >= text.length) { if (animate) onDone(); return }
    const id = setTimeout(() => { setN((v) => Math.min(text.length, v + 3)); onTick() }, 14)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, text, animate])
  let s = text.slice(0, n).replace(/\[\[[^\]]*$/, '')
  if ((s.match(/\*\*/g) || []).length % 2) s += '**'
  return <>{render(s)}</>
}

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
  const scroll = () => end.current?.scrollIntoView({ block: 'end' })
  useEffect(() => { scroll() }, [msgs, open, busy])

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

  // numa página de companhia, as rotas sugeridas dessa companhia abrem logo nela
  const preferredFor = (from: string, to: string) =>
    airlineId && data?.routes?.some((r: any) => (r.from === from && r.to === to) || (r.from === to && r.to === from)) ? { iata: data.airline?.iata, id: airlineId } : null

  const send = async (override?: string) => {
    const raw = (override ?? text).trim()
    const content = (raw.replace(/^copilot[\s,:;-]*/i, '') || raw).slice(0, 600)
    if (!content || busy) return
    const next: Msg[] = [...msgs, { role: 'user', content }]
    setMsgs(next); setText(''); setBusy(true); setErr('')
    try {
      const r = await fetch('/api/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.slice(-8).map((x) => ({ role: x.role, content: x.content })), context, lang }) })
      const d = await r.json().catch(() => ({}))
      if (r.status === 429) setErr(t('copilot.limit'))
      else if (!r.ok || !d.reply) setErr(t('copilot.unavailable'))
      else setMsgs([...next, { role: 'assistant', content: String(d.reply), fresh: true }])
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
        <div role="dialog" aria-label={t('copilot.title')} className="fixed bottom-24 right-4 z-50 flex h-[min(75dvh,36rem)] w-[min(94vw,26rem)] flex-col rounded-3xl bg-[#111] shadow-2xl ring-1 ring-white/10 sm:bottom-6">
          <div className="flex items-center justify-between px-4 pt-4">
            <p className="text-sm font-semibold">{t('copilot.title')}</p>
            <button type="button" aria-label={t('copilot.close')} onClick={() => setOpen(false)} className="p-1 text-white/50 hover:text-white"><X className="size-4" /></button>
          </div>
          <div className="mt-2 flex-1 space-y-3 overflow-y-auto px-4 pb-2 text-sm leading-relaxed">
            <p className="rounded-2xl bg-white/[.06] px-3 py-2 text-white/70">{t('copilot.hello')}</p>
            {msgs.map((x, i) => x.role === 'user' ? (
              <p key={i} className="ml-8 rounded-2xl bg-white px-3 py-2 text-black">{x.content}</p>
            ) : (
              <div key={i} className="mr-4 rounded-2xl bg-white/[.06] px-3 py-2 text-white/80">
                <Typewriter text={x.content} animate={!!x.fresh} onTick={scroll} onDone={() => setMsgs((cur) => cur.map((y, j) => (j === i ? { ...y, fresh: false } : y)))} render={(s) => <Rich text={s} preferred={null} onGo={() => setOpen(false)} />} />
              </div>
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
