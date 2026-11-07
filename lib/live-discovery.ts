import 'server-only'
import {enrichLiveEstimate} from '@/lib/live-estimates'
import {BRASILEIRINHO,isBrasileirinho} from '@/lib/brasileirinho'
import { live, liveGlobal, type LiveAircraft } from '@/lib/live'
import { lookupCallsign } from '@/lib/route-lookup'
import { airlineByIcao, parseCallsign } from '@/lib/airline-lookup'
import { distNm } from '@/lib/live-geo'
import {mixedRadarBatch,type RadarAirport} from '@/lib/radar-airports'
import { getDb,getRadarAirports } from '@/lib/db'
import { getLiveHistory } from '@/lib/live-history'
import type { LiveHistory, HistoryRecord, SyncState } from '@/lib/live-history-sqlite'
import { AviationstackTimetable } from '@/lib/live-timetable'
import { FlightObservations, currentFlights, radarExpiry, airportDirection, flightIdentity, type ResolvedFlight } from '@/lib/live-model'

// In-memory fallback keeps live requests useful when the configured persistent store is unavailable.
const observations = new FlightObservations()
const pending = new Map<string, Promise<void>>()
const scanned = new Map<string, number>()
const radarAnchors:RadarAirport[]=[{id:'FNLU',lat:-8.858375,lon:13.231178,kind:'airport'}]
const satellites = ['FNLU','NBJ', 'LIS', 'JNB', 'DXB', 'LHR', 'JFK', 'GRU', 'HND']
// Serverless can still discover traffic without a server database. Browser history persists it per device.
const transientRows = new Map<string, HistoryRecord>(), transientSync = new Map<string, SyncState>()
const transientHistory: LiveHistory = {
 write: async rows => { for (const f of rows) { const old=transientRows.get(f.id); if(!old||f.updatedAt>=old.updatedAt)transientRows.set(f.id,f) }; for(const [id,f] of transientRows)if(f.expiresAt<Date.now())transientRows.delete(id); while(transientRows.size>5000)transientRows.delete(transientRows.keys().next().value!) },
 read: async () => [...transientRows.values()].filter(f=>f.expiresAt>Date.now()),
 getSync: async scope => transientSync.get(scope)||null,
 setSync: async (scope,state) => {transientSync.set(scope,state)},
}
function workingHistory(): LiveHistory { try {return getLiveHistory()} catch {return transientHistory} }


export async function resolveAircraft(a: LiveAircraft, observedAt = Date.now(),options:{deadline?:number;priority?:number}={}): Promise<ResolvedFlight> {
  const p = parseCallsign(a.callsign)
  const [route, airline] = await Promise.all([
    lookupCallsign(a.callsign,options),
    p ? airlineByIcao(p.icao) : Promise.resolve(null),
  ])
  const db = await getDb()
  const destination = route?.to ? db.airports.get(route.to) : undefined
  const expiresAt = radarExpiry(observedAt, destination ? distNm(a, destination) : undefined, a.gs)
  const special=isBrasileirinho(a)
  const airlineIata = special?'':route?.airlineIata || airline?.iata || ''
  return enrichLiveEstimate({
    ...a, expiresAt, routeCheckedAt: observedAt, source: 'radar', airlineIata, airlineIcao: special?'':route?.airlineIcao || airline?.icao || p?.icao || '',
    airlineName: special?BRASILEIRINHO.name:route?.airlineName || airline?.name || 'Unknown airline',
    flightNumber: special?'':flightIdentity(a.callsign, airlineIata, route?.flightNumber),
    from: route?.from || null, to: route?.to || null,
    fromCity: route?.fromCity || '', toCity: route?.toCity || '',
    observedAt, status: 'observed', remainingMinutes: null,
  },db.airports)
}

let priorRead:{at:number;p:Promise<ResolvedFlight[]>}|undefined
async function knownFlights(){
 if(!priorRead||Date.now()-priorRead.at>1000){const p=workingHistory().read(),entry={at:Infinity,p};priorRead=entry;p.then(()=>{entry.at=Date.now()},()=>{if(priorRead===entry)priorRead=undefined})}
 const stored=await priorRead.p
 return new Map([...stored,...observations.snapshot()].sort((a,b)=>(a.updatedAt||a.observedAt)-(b.updatedAt||b.observedAt)).map(f=>[f.hex,f]))
}
function routeCandidate(a:LiveAircraft,iata:ReadonlySet<string>){
 if(a.onGround)return false
 if(isBrasileirinho(a))return true
 if(a.reg&&a.callsign.replace(/[^A-Z0-9]/g,'')===a.reg.toUpperCase().replace(/[^A-Z0-9]/g,''))return false
 return /^(?:[A-Z]{3}[0-9]|[A-Z]{2}[0-9])/.test(a.callsign)||(/^[A-Z][0-9][0-9]/.test(a.callsign)&&iata.has(a.callsign.slice(0,2)))
}
function routeFresh(old:ResolvedFlight|undefined,a:LiveAircraft,now:number){return !!(old&&!old.onGround&&!old.terminal&&old.from&&old.to&&old.callsign===a.callsign&&now-(old.routeCheckedAt||0)<5*60_000)}
function negativeFresh(old:ResolvedFlight|undefined,a:LiveAircraft,now:number){return !!(old&&(!old.from||!old.to)&&old.callsign===a.callsign&&now-(old.routeCheckedAt||0)<60_000)}
async function discover(code: string, station?:RadarAirport, limit=20) {
  if (Date.now() - (scanned.get(code) || 0) < 45_000) return
  const existing = pending.get(code)
  if (existing) return existing
  const work = (async () => {
    const db = await getDb(),ap=station||db.airports.get(code)
    if(!ap)return
    const iata=new Set(db.airlines?[...db.airlines.values()].map(a=>a.iata):[])
    const aircraft=await live(`/point/${ap.lat}/${ap.lon}/250`),observedAt=Date.now(),deadline=observedAt+12000
    const known=await knownFlights(),candidates:LiveAircraft[]=[],refreshed:HistoryRecord[]=[]
    for(const a of aircraft){
     const old=known.get(a.hex)
     if(old&&(a.onGround||routeFresh(old,a,observedAt))){
      const target=db.airports.get(old.to||''),f={...old,...a,observedAt,updatedAt:observedAt,expiresAt:a.onGround?observedAt+20*60_000:radarExpiry(observedAt,target?distNm(a,target):undefined,a.gs),id:`radar:${a.hex}`}
      observations.record(f);refreshed.push(f)
     }else if(routeCandidate(a,iata)&&!negativeFresh(old,a,observedAt))candidates.push(a)
    }
    let failed=false,historyFailed=false
    try{await workingHistory().write(refreshed)}catch{historyFailed=true}
    const offset=Math.floor(observedAt/45000)*limit%Math.max(candidates.length,1)
    const selected=[...candidates.slice(offset),...candidates.slice(0,offset)].slice(0,limit)
    for(let i=0;i<selected.length&&Date.now()<deadline;i+=8){
     const batch=await Promise.allSettled(selected.slice(i,i+8).map(a=>resolveAircraft(a,observedAt,{deadline,priority:0}))),rows=[]
     for(const result of batch){if(result.status==='fulfilled'){observations.record(result.value);rows.push({...result.value,id:`radar:${result.value.hex}`,updatedAt:observedAt,expiresAt:result.value.expiresAt||observedAt+20*60_000})}else failed=true}
     try{await workingHistory().write(rows)}catch{historyFailed=true}
    }
    scanned.set(code,Date.now())
    if(historyFailed)throw new Error('History write unavailable')
    if(failed)throw new Error('Some flight routes could not be resolved')
  })()
  pending.set(code,work)
  try{await work}finally{pending.delete(code)}
}

let radarPending:Promise<{codes:string[];nextOffset:number;complete:boolean;total:number|null}>|undefined
async function discoverRadar(background=false){
 if(radarPending)return radarPending
 radarPending=(async()=>{
  const limit=background?24:6,history=workingHistory(),scope=`radar:facilities:v2:${limit}`,previous=await history.getSync(scope)
  if(previous&&Date.now()-previous.checkedAt<45_000)return {codes:[],...previous}
  const airports=await getRadarAirports()
  const batch=mixedRadarBatch(airports,previous?.nextOffset,limit)
  const results=await Promise.allSettled(batch.points.map(point=>discover(point.id,point,5)))
  // Advance even if a station fails: one timeout must not starve the rest of the world.
  // Failed stations are revisited on the next sweep and this request remains degraded.
  const state={checkedAt:Date.now(),nextOffset:batch.nextOffset,complete:batch.complete,total:batch.total}
  await history.setSync(scope,state)
  if(results.some(r=>r.status==='rejected'))throw new Error('Some radar stations unavailable')
  return {codes:batch.points.map(p=>p.id),...state}
 })()
 try{return await radarPending}finally{radarPending=undefined}
}

let timetable: AviationstackTimetable | undefined

const globalPending=new Map<string,Promise<SyncState>>()
async function discoverGlobal(limit=20,cursor?:string,seen:ReadonlySet<string>=new Set()) {
 const key=(cursor===undefined?'automatic':cursor)+':'+[...seen].join(',')
 const existing=globalPending.get(key);if(existing)return existing
 const work=scanGlobal(limit,cursor,seen);globalPending.set(key,work)
 try{return await work}finally{globalPending.delete(key)}
}
async function scanGlobal(limit: number,cursor?:string,seen:ReadonlySet<string>=new Set()) {
  const scope='radar:global:v2',history=workingHistory(),previous=await history.getSync(scope)
  if(cursor===undefined&&previous&&Date.now()-previous.checkedAt<45000)return previous
  const aircraft=(await liveGlobal()).sort((a,b)=>a.hex.localeCompare(b.hex)),now=Date.now(),deadline=now+12000
  const known=await knownFlights(),db=await getDb(),unresolved:LiveAircraft[]=[],refreshed:HistoryRecord[]=[]
  const iata=new Set(db.airlines?[...db.airlines.values()].map(a=>a.iata):[])
  for(const a of aircraft){
   const old=known.get(a.hex)
   if(old&&(a.onGround||routeFresh(old,a,now))){
    const target=db.airports.get(old.to||''),f={...old,...a,observedAt:now,updatedAt:now,expiresAt:a.onGround?now+20*60_000:radarExpiry(now,target?distNm(a,target):undefined,a.gs),id:`radar:${a.hex}`}
    observations.record(f);refreshed.push(f)
   }else if(routeCandidate(a,iata)&&!negativeFresh(old,a,now))unresolved.push(a)
  }
  // Ground tombstones also reach browsers whose previous page ran on another instance.
  for(const a of aircraft)if(a.onGround&&!known.has(a.hex)&&seen.has(a.hex)){
   const f={...a,from:null,to:null,airlineIata:'',airlineIcao:'',airlineName:'',flightNumber:'',fromCity:'',toCity:'',observedAt:now,updatedAt:now,expiresAt:now+20*60_000,status:'observed' as const,remainingMinutes:null,terminal:true,id:`radar:${a.hex}`}
   observations.record(f);refreshed.push(f)
  }
  await history.write(refreshed)
  // An inclusive hex cursor is stable when the unresolved work list shrinks.
  let offset=previous?.nextHex?unresolved.findIndex(a=>a.hex>=previous.nextHex!):-1
  if(offset<0)offset=previous?.nextHex?0:Math.floor(now/45000)*limit%Math.max(unresolved.length,1)
  if(cursor!==undefined)offset=cursor==='start'?0:unresolved.findIndex(a=>a.hex>=cursor)
  const ordered=cursor!==undefined?(offset<0?[]:unresolved.slice(offset)):[...unresolved.slice(offset),...unresolved.slice(0,offset)],batch=ordered.slice(0,limit)
  let failed=0,processed=0,resolved=0,consumed=0
  for(let i=0;i<batch.length&&Date.now()<deadline;i+=8){
   const selected=batch.slice(i,i+8),outcomes=await Promise.allSettled(selected.map(a=>resolveAircraft(a,now,{deadline,priority:10}))),rows=[]
   const budgetFailure=outcomes.findIndex(outcome=>outcome.status==='rejected'&&String(outcome.reason?.message)==='Route lookup budget exhausted')
   for(const outcome of outcomes){if(outcome.status==='rejected'){failed++;continue};const f=outcome.value;if(f.from&&f.to)resolved++;observations.record(f);rows.push({...f,id:`radar:${f.hex}`,updatedAt:now,expiresAt:f.expiresAt||now+20*60_000})}
   processed+=selected.length;consumed=i+(budgetFailure<0?selected.length:budgetFailure)
   await history.write(rows)
   if(budgetFailure>=0)break
  }
  const reachedEnd=consumed>=ordered.length,nextHex=ordered[consumed]?.hex
  const state={checkedAt:now,nextOffset:reachedEnd?0:unresolved.findIndex(a=>a.hex===nextHex),complete:reachedEnd&&!failed,total:aircraft.length,candidates:unresolved.length,processed,resolved,failedRoutes:failed,budgetLimited:consumed<batch.length,...(!reachedEnd&&nextHex?{nextHex}:{})}
  if(cursor===undefined)await history.setSync(scope,state)
  return state
}

export async function discoverSupplementalRadar(){
 try{return await discoverRadar(false)}catch(error){console.warn('[live] Supplemental radar unavailable');return null}
}

export async function discoverFlights(airport?: string, options: { background?: boolean;radar?:boolean;cursor?:string;stations?:boolean;global?:boolean;seen?:string[] } = {}) {
  const db = await getDb()
  const codes = options.stations===false?[]:[...new Set(airport ? [airport, ...satellites] : satellites)].filter(code=>db.airports.has(code)||radarAnchors.some(a=>a.id===code))
  let historyAvailable = true
  let stored: ResolvedFlight[] = []
  let timetableStatus = { configured: false, complete: false, total: null as number | null, error: undefined as string | undefined }
  try {
    const history = getLiveHistory()
    if (process.env.AVIATIONSTACK_API_KEY) {
      timetable ||= new AviationstackTimetable(history, process.env.AVIATIONSTACK_API_KEY)
      try { timetableStatus = { ...await timetable.sync(airport), error: undefined } }
      catch { timetableStatus = { configured: true, complete: false, total: null, error: 'Timetable source unavailable' } }
    }
  } catch { historyAvailable = false }
  // The global provider feed extends discovery beyond fixed satellites. Its route enrichment is
  // bounded and cursor-based; lack of coverage or a partially processed feed is never called complete.
  const globalTask=options.global===false?Promise.resolve({checkedAt:Date.now(),nextOffset:0,complete:false,total:null} as SyncState):discoverGlobal(options.background?300:100,options.cursor,new Set(options.seen))
  const radarTask=options.radar===false?Promise.resolve({codes:[],nextOffset:0,complete:false,total:null,deferred:true}):discoverRadar(options.background)
  const outcomes=await Promise.allSettled([...codes.map(code=>discover(code,radarAnchors.find(a=>a.id===code))),radarTask,globalTask])
  try { stored = await workingHistory().read() } catch { historyAvailable = false }
  const snapshot = [...stored, ...observations.snapshot()]
  const flights = currentFlights(snapshot)
  const retired = snapshot.filter(f=>f.onGround||f.terminal||!f.from||!f.to).map(f=>({...f, terminal:true}))
  if(outcomes.some(r=>r.status==='rejected'&&String(r.reason?.message)==='History write unavailable'))historyAvailable=false
  const data = (airport ? flights.filter(f => airportDirection(f, airport)) : flights).map(f => ({
    ...enrichLiveEstimate(f,db.airports), fromCity: f.fromCity || db.airports.get(f.from || '')?.city || '', toCity: f.toCity || db.airports.get(f.to || '')?.city || '',
    ...(airport ? { kind: airportDirection(f, airport) } : {}),
  }))
  const global=outcomes[outcomes.length-1] as PromiseSettledResult<Awaited<ReturnType<typeof discoverGlobal>>>
  const routeFailures=global.status==='fulfilled'?(global.value.failedRoutes||0):0
  const sourceOutcomes=outcomes.filter((_,i)=>i!==outcomes.length-2||options.radar!==false)
  return {
    data, retired,
    availability: { live: (data.some(f=>f.status==='observed') || sourceOutcomes.some(r=>r.status==='fulfilled')) ? (sourceOutcomes.some(r=>r.status==='rejected')||routeFailures ? 'partial' : 'available') : 'unavailable' },
    coverage: 'Provider coverage is partial. A timetable source is optional; estimates are not confirmed airborne positions.',
    scannedAirports: [...new Set([...codes,...(outcomes[outcomes.length-2].status==='fulfilled'?(outcomes[outcomes.length-2] as PromiseFulfilledResult<Awaited<ReturnType<typeof discoverRadar>>>).value.codes:[])])],
    radarCoverage: outcomes[outcomes.length-2].status==='fulfilled'?(outcomes[outcomes.length-2] as PromiseFulfilledResult<Awaited<ReturnType<typeof discoverRadar>>>).value:{complete:false,unavailable:true},
    history: { persistent: historyAvailable }, timetable: timetableStatus,
    globalFeed: global.status === 'fulfilled' ? global.value : { complete: false, unavailable: true },
    degraded: !historyAvailable || !!timetableStatus.error || !!routeFailures || outcomes.some(r => r.status === 'rejected'),
    checkedAt: new Date().toISOString(),
  }
}
