'use client'
import BackLink from '@/components/BackLink'

import { useParams, usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { ArrowLeft, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type {ParsedFlightPlan} from '@/lib/flight-plan-parser'
import {parseRouteData} from '@/lib/route-import'
import { matchAircraft } from '@/lib/aircraft-db'
import { estimateBlockMinutes, parseSpeedAt } from '@/lib/flight-time'
import { flightNumberPart } from '@/lib/live-model'
import {departureChoice} from '@/lib/flight-workflow'
import {useLocalStorage} from '@/lib/use-local-storage'
import type {RosterFlight} from '@/lib/roster-data'
import {useT,useLang} from '@/lib/i18n'
import { BoardingPass } from '@/components/BoardingPass'
import { AirportInput, nmBetween, type Ap } from '@/components/AirportInput'

type Geo = { fromIata: string; toIata: string; fromCity: string; toCity: string; distanceNm: number }

const hhmm = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
}
const inputCls = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#1f88ff]'

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-xs text-white/50 ${className}`}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}

export default function FlightPlanPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const t = useT()
  const launchLock=useRef(false)
  const [launching,setLaunching]=useState(false)
  const lang=useLang(s=>s.lang)
  const [bookings,setBookings]=useLocalStorage<RosterFlight[]>('myroster.bookings',[])
  const [pending,setPending]=useState<{options:any;at:number}|null>(null)
  const [authed, setAuthed] = useState(false)
  const [seed, setSeed] = useState<any>(null)
  const [geo, setGeo] = useState<Geo | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ flight: '', dep: '', arr: '', aircraft: '', time: '12:00', fl: 350, speed: '', duration: 60 })
  const set = (k: string, v: any) => { setReady(false); if(k==='dep'||k==='arr')setPln(null); setForm((f) => ({ ...f, [k]: v })) }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setAuthed(true)
      else router.replace(`/login?next=${encodeURIComponent(pathname)}`)
    })
  }, [pathname, router])

  // default departure time = current time (you can still change it)
  useEffect(() => {
    const d = new Date()
    const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    setForm((x) => ({ ...x, time: t }))
  }, [])

  // pre-fill when coming from a route page
  useEffect(() => {
    try {
      const raw = localStorage.getItem('myroster.routeSeed')
      if (!raw) return
      const s = JSON.parse(raw)
      if (String(s.id).toUpperCase() !== String(id).toUpperCase()) return
      setSeed(s)
      setForm((f) => ({
        ...f,
        flight: s.flightNumber ? `${s.airlineIata || s.airlineIcao || ''}${s.flightNumber}` : '',
        dep: s.orig || '',
        arr: s.dest || '',
        aircraft: s.aircraft || f.aircraft,
        duration: s.durationMin || f.duration,
      }))
    } catch {}
  }, [id])

  // airports typed as IATA, ICAO or city; distance comes from their coordinates
  const [fromAp, setFromAp] = useState<Ap | null>(null)
  const [toAp, setToAp] = useState<Ap | null>(null)
  useEffect(() => {
    if (fromAp && toAp && fromAp.iata !== toAp.iata)
      setGeo({ fromIata: fromAp.iata, toIata: toAp.iata, fromCity: fromAp.city, toCity: toAp.city, distanceNm: nmBetween(fromAp, toAp) })
    else setGeo(null)
  }, [fromAp, toAp])

  const ac = matchAircraft(form.aircraft)
  const acName = ac.status === 'exact' && ac.match ? ac.match.name : ''

  // recalculate gate-to-gate time when distance, aircraft or speed change
  useEffect(() => {
    if (geo?.distanceNm && (acName || !form.aircraft.trim())) {
      const speedKt = parseSpeedAt(form.speed, form.fl) || undefined
      setForm((f) => ({ ...f, duration: estimateBlockMinutes(geo.distanceNm, acName, { speedKt, fl: form.fl }) }))
    }
  }, [geo, acName, form.speed, form.fl])

  const executeLaunch = async (o: { from: string; to: string; fromCity: string; toCity: string; aircraft: string; fl: number; distanceNm: number; durationMin: number; fromLat?: number; fromLon?: number; toLat?: number; toLon?: number; waypoints?: { id?: string; lat: number; lon: number }[] }, scheduledAt?:number) => {
    if(launchLock.current)return
    launchLock.current=true;setLaunching(true)
    try {
    const scheduleId=scheduledAt?crypto.randomUUID():undefined
    const {data:session}=await supabase.auth.getSession()
    const plan={...(seed||{}),createdAt:Date.now(),id:String(id),airlineIata:seed?.airlineIata||String(id).split('-')[0].toUpperCase(),flightNumber:flightNumberPart(form.flight,seed?.airlineIata||'',seed?.airlineIcao||''),from:o.from,to:o.to,fromCity:o.fromCity,toCity:o.toCity,aircraft:o.aircraft,altitude:o.fl*100,distanceNm:o.distanceNm,durationMin:o.durationMin,fromLat:o.fromLat,fromLon:o.fromLon,toLat:o.toLat,toLon:o.toLon,waypoints:o.waypoints,scheduledAt,scheduleId,accountId:session.session?.user.id}
    if(scheduledAt){
      setBookings([...bookings,{id:scheduleId!,planId:String(id),plan,airlineIata:plan.airlineIata,airlineName:plan.airlineName||plan.airlineIata,orig:o.from,dest:o.to,fromCity:o.fromCity,toCity:o.toCity,flightNumber:form.flight||String(id),aircraft:o.aircraft,departure:new Date(scheduledAt).toISOString(),distanceNm:o.distanceNm,scheduledAt,takeoffAt:null,status:'scheduled',accountId:session.session?.user.id} as RosterFlight])
      setPending(null);router.push('/trips');return
    }
    try {
      localStorage.setItem('myroster.activePlan',JSON.stringify(plan))
    } catch {setError(t('schedule.failed'));return}
    const sid = new URLSearchParams(window.location.search).get('session')
    if (sid) {
      ;(async () => {
        try {
          const raw = localStorage.getItem('myroster.activePlan')
          const { data: s } = await supabase.auth.getSession()
          const uid = s.session?.user.id
          if (uid && raw) await supabase.from('flight_session_events').insert({ session_id: sid, user_id: uid, kind: 'start', payload: JSON.parse(raw) })
        } catch {}
      })()
    }
    router.push(`/flights/${id}/fly${sid ? `?session=${encodeURIComponent(sid)}` : ''}`)
    }catch{setError(t('schedule.failed'))}finally{launchLock.current=false;setLaunching(false)}
  }

  const launch = (options:any) => {try{const choice=departureChoice(form.time);if(choice.differs)setPending({options,at:choice.scheduledAt});else executeLaunch(options)}catch{setError(t('schedule.invalidTime'))}}

  const createPlan = () => {
    if (!form.dep.trim() || !form.arr.trim()) return setError(t('plan.errAirports'))
    if (form.aircraft.trim() && ac.status === 'none') return setError(t('plan.unknownAc', { name: form.aircraft }))
    if (form.aircraft.trim() && !acName) return setError(t('plan.errConfirm'))
    if (!Number.isFinite(form.duration)||form.duration<=0) return setError(t('plan.errBlock'))
    setError('')
    setReady(true)
  }

  const dep = form.dep.trim().toUpperCase()
  const arr = form.arr.trim().toUpperCase()
  const manualLaunch = () =>
    launch({
      from: geo?.fromIata || dep, to: geo?.toIata || arr,
      fromCity: geo?.fromCity || dep, toCity: geo?.toCity || arr,
      aircraft: acName, fl: form.fl, distanceNm: geo?.distanceNm || 0, durationMin: form.duration,
      fromLat: fromAp?.lat, fromLon: fromAp?.lon, toLat: toAp?.lat, toLon: toAp?.lon,
    })

  // .pln: the waypoints are read, the route is recalculated through them and drawn on the globe
  const [pln, setPln] = useState<{ from: string; to: string; fl: number; distance: number; direct: number; wps: { id?: string; lat: number; lon: number }[] } | null>(null)
  const [importText,setImportText]=useState(''),[importing,setImporting]=useState(false),[imported,setImported]=useState<ParsedFlightPlan[]>([]),[selectedImport,setSelectedImport]=useState(0)
  const applyImport = (p:ParsedFlightPlan) => {
      setError('');setFromAp(null);setToAp(null)
      setForm(f=>({...f,dep:p.departure,arr:p.arrival,aircraft:p.aircraft||f.aircraft,flight:p.flightNumber||f.flight,fl:Math.round(p.cruiseAltitude/100),duration:p.estimatedTime||f.duration}))
      const wps=p.waypoints.map(w=>({id:w.id,lat:w.latitude,lon:w.longitude}))
      const direct=wps.length>1?nmBetween(wps[0],wps[wps.length-1]):0
      let distance=0;for(let i=1;i<wps.length;i++)distance+=nmBetween(wps[i-1],wps[i])
      setPln({from:p.departure,to:p.arrival,fl:Math.round(p.cruiseAltitude/100),distance:distance||p.distance,direct,wps});setReady(false)
  }
  const importContent=(text:string)=>{const plans=parseRouteData(text);setImported(plans);setSelectedImport(0);applyImport(plans[0])}
  const importPasted=async()=>{setImporting(true);setError('');try{let content=importText.trim();if(/^https?:/i.test(content)){const response=await fetch('/api/flight-plan/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:content})});const data=await response.json();if(!response.ok){setError(t(data.error==='authentication'?'plan.importAuth':'plan.importError'));return}content=data.content}importContent(content)}catch{setError(t('plan.importError'))}finally{setImporting(false)}}
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      if(file.size>2_000_000)throw Error('Too large')
      importContent(await file.text())
    } catch {
      setError(t('plan.importError'))
    }
  }
  const plnFl = pln?.fl || form.fl
  const importedDistance=pln?.distance||geo?.distanceNm||0
  const plnMin = pln ? (importedDistance ? estimateBlockMinutes(importedDistance, acName, { routed: true, fl: plnFl, speedKt: parseSpeedAt(form.speed, plnFl) || undefined }) : form.duration) : 0
  const plnLaunch = () => {
    if (!pln) return
    const f = pln.wps[0]
    const l = pln.wps[pln.wps.length - 1]
    launch({
      from: fromAp?.iata||pln.from, to: toAp?.iata||pln.to, fromCity: fromAp?.city||pln.from, toCity: toAp?.city||pln.to,
      aircraft: acName, fl: plnFl, distanceNm: importedDistance, durationMin: plnMin,
      fromLat: f?.lat??fromAp?.lat, fromLon: f?.lon??fromAp?.lon, toLat: l?.lat??toAp?.lat, toLon: l?.lon??toAp?.lon, waypoints: pln.wps,
    })
  }

  if (!authed) return <section className="min-h-screen p-5 text-white/40 sm:p-8">{t('plan.checking')}</section>

  const [h, mi] = form.time.split(':').map(Number)
  const depMin = (h || 0) * 60 + (mi || 0)

  return (
    <section className="min-h-screen p-5 sm:p-8">
      <BackLink href="/search" className="inline-flex min-h-11 items-center gap-2 text-sm text-white/55 hover:text-white">
        <ArrowLeft className="size-4" /> {t('back')}
      </BackLink>
      <h1 className="mt-4 text-2xl font-semibold">{t('plan.title')}</h1>{seed?.callsign && <p className="mt-3 font-mono text-sm text-white/50">{t('flight.callsign')}: {seed.callsign}</p>}
      <p className="mt-1 text-sm text-white/50">{t('plan.flight', { id: String(id) })}</p>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-5">
        <h2 className="text-sm font-medium text-white/70">{t('plan.uploadTitle')}</h2>
        <p className="mb-3 mt-1 text-xs text-white/40">{t('plan.importHint')}</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#1f88ff] px-4 py-2 text-sm font-medium">
          <Upload className="size-4" /> {t('plan.choose')}
          <input type="file" accept=".pln,.xml,.json,.csv" onChange={handleFile} className="hidden" />
        </label>
        <label className="mt-4 block text-xs text-white/60">{t('plan.importLabel')}<textarea value={importText} onChange={e=>setImportText(e.target.value)} maxLength={2000000} rows={4} className={`${inputCls} mt-2`} placeholder="https://planner.flightsimulator.com/share/…" /></label>
        <button disabled={importing||!importText.trim()} onClick={importPasted} className="mt-2 min-h-11 rounded-xl border border-white/15 px-4 text-sm disabled:opacity-40">{t(importing?'live.loading':'plan.importAction')}</button>
        {imported.length>1&&<label className="mt-3 block text-xs">{t('plan.importSelect')}<select value={selectedImport} onChange={e=>{const index=Number(e.target.value);setSelectedImport(index);applyImport(imported[index])}} className={`${inputCls} mt-2 bg-black`}>{imported.map((p,i)=><option key={i} value={i}>{i+1}. {p.departure} → {p.arrival} {p.flightNumber}</option>)}</select></label>}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-5">
        <h2 className="mb-3 text-sm font-medium text-white/70">{t('plan.manual')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('plan.flightNo')}><input className={inputCls} placeholder={t('plan.flightNoPh')} value={form.flight} onChange={(e) => set('flight', e.target.value)} /></Field>
          <Field label={t('plan.time')}><input className={inputCls} type="time" value={form.time} onChange={(e) => set('time', e.target.value)} /></Field>
          <Field label={t('plan.origin')}><AirportInput value={form.dep} onChange={(v) => set('dep', v)} onResolve={setFromAp} className={inputCls} /></Field>
          <Field label={t('plan.dest')}><AirportInput value={form.arr} onChange={(v) => set('arr', v)} onResolve={setToAp} className={inputCls} /></Field>
          <Field label={t('plan.aircraft')} className="col-span-2">
            <input className={inputCls} placeholder={t('plan.aircraftPh')} value={form.aircraft} onChange={(e) => set('aircraft', e.target.value)} />
            {ac.status === 'exact' && ac.match && <p className="mt-1 text-xs text-[#55a7ff]">✓ {ac.match.name} · {ac.match.icao}</p>}
            {ac.status === 'fuzzy' && ac.match && (
              <button type="button" onClick={() => set('aircraft', ac.match!.name)} className="mt-1 text-xs text-[#55a7ff]">{t('plan.didYouMean', { name: ac.match.name })}</button>
            )}
            {ac.status === 'family' && (
              <div className="mt-2 flex flex-wrap gap-2">
                {ac.matches.map((m) => (
                  <button key={m.icao + m.name} type="button" onClick={() => set('aircraft', m.name)} className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-xs">{m.name}</button>
                ))}
              </div>
            )}
            {ac.status === 'none' && form.aircraft.trim() && <p className="mt-1 text-xs text-red-300">{t('plan.unknownAc', { name: form.aircraft })}</p>}
          </Field>
          <Field label={t('plan.fl')}><input className={inputCls} type="number" value={form.fl} onChange={(e) => set('fl', Number(e.target.value))} /></Field>
          <Field label={t('plan.speed')}><input className={inputCls} placeholder="M.82 or 450" value={form.speed} onChange={(e) => set('speed', e.target.value)} /></Field>
        </div>

        <div className="mt-4 grid grid-cols-4 rounded-2xl bg-white/[.04] p-3 text-center text-xs">
          <div><p className="text-white/40">{t('plan.distance')}</p><p className="mt-1 text-sm font-semibold">{geo ? `${geo.distanceNm.toLocaleString('en-US')} nm` : '—'}</p></div>
          <div><p className="text-white/40">{t('plan.departure')}</p><p className="mt-1 text-sm font-semibold">{form.time}</p></div>
          <div>
            <p className="text-white/40">{t('plan.blockTime')}</p>
            <input className="mt-1 w-14 rounded bg-transparent text-center text-sm font-semibold outline-none" type="number" value={form.duration} onChange={(e) => set('duration', Number(e.target.value))} />
          </div>
          <div><p className="text-white/40">{t('plan.arrival')}</p><p className="mt-1 text-sm font-semibold">{hhmm(depMin + form.duration)}</p></div>
        </div>
        <p className="mt-2 text-xs text-white/40">
          {geo ? t('plan.helpAuto') : t('plan.helpManual')}
        </p>
        <button onClick={createPlan} className="mt-3 rounded-xl bg-[#1f88ff] px-4 py-2 text-sm font-medium">{t('plan.create')}</button>
      </div>

      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      {pln && (
        <div className="mt-6">
          <div className="mb-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium text-white/80">{t('plan.plnTitle')}</p>
              <button type="button" onClick={() => setPln(null)} className="text-xs text-[#55a7ff]">{t('plan.plnClear')}</button>
            </div>
            <p className="mt-2 text-white/60">{pln.from} → {pln.to} · FL{plnFl}</p>
            <p className="mt-1 text-white/60">{t('plan.plnWaypoints', { n: pln.wps.length })}</p>
            <p className="mt-1 text-white/60">
              {pln.direct && pln.distance
                ? t('plan.plnRoute', { route: Math.round(importedDistance).toLocaleString('en-US'), direct: Math.round(pln.direct).toLocaleString('en-US'), extra: Math.max(0, Math.round((pln.distance / pln.direct - 1) * 100)) })
                : t('plan.plnRouteOnly', { route: Math.round(importedDistance).toLocaleString('en-US') })}
              {' · '}{Math.floor(plnMin / 60)}h {String(plnMin % 60).padStart(2, '0')}m
            </p>
          </div>
          <BoardingPass
            tear
            data={{
              from: pln.from, to: pln.to, airline: seed?.airlineName, airlineIata: seed?.airlineIata, flight: form.flight || String(id).toUpperCase(), aircraft: acName,
              distanceNm: Math.round(importedDistance), durationMin: plnMin, date: new Date().toISOString().slice(0, 10),
            }}
            onBoard={plnLaunch}
          />
        </div>
      )}

      {ready && !pln && (
        <div className="mt-6">
          <BoardingPass
            tear
            data={{
              from: geo?.fromIata || dep, to: geo?.toIata || arr, fromCity: geo?.fromCity, toCity: geo?.toCity,
              airline: seed?.airlineName, airlineIata: seed?.airlineIata, flight: form.flight || String(id).toUpperCase(), aircraft: acName,
              distanceNm: geo?.distanceNm, durationMin: form.duration, date: new Date().toISOString().slice(0, 10),
            }}
            onBoard={manualLaunch}
          />
        </div>
      )}
      {pending&&<div role="dialog" aria-modal="true" aria-label={t('schedule.title')} className="fixed inset-0 z-[65] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#101010] p-6">
        <h2 className="text-xl font-medium">{t('schedule.title')}</h2><p className="mt-3 text-sm text-white/55">{t('schedule.different',{time:new Date(pending.at).toLocaleString(lang,{dateStyle:'medium',timeStyle:'short'})})}</p>
        <p className="mt-3 text-xs text-white/40">{t('schedule.browserNote')}</p>
        <button disabled={launching} onClick={()=>executeLaunch(pending.options)} className="mt-6 min-h-11 w-full rounded-full bg-white px-4 text-sm font-medium text-black">{t('schedule.now')}</button>
        <button disabled={launching} onClick={()=>executeLaunch(pending.options,pending.at)} className="mt-2 min-h-11 w-full rounded-full border border-white/20 px-4 text-sm">{t('schedule.at')}</button>
        <button onClick={()=>setPending(null)} className="mt-2 min-h-11 w-full text-xs text-white/45">{t('schedule.cancel')}</button>
      </div></div>}
    </section>
  )
}
