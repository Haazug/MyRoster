import {flightNumberPart,type ResolvedFlight} from './live-model'
export type LearnedRouteNumber={id:string;number:string;airlineIata:string;airlineIcao:string;from:string;to:string;callsign:string;observedAt:number;aircraftType?:string;registration?:string}
const retention=3650*86400_000
export function rememberRouteNumbers(previous:LearnedRouteNumber[],updates:ResolvedFlight[],now=Date.now()){
 const entries=new Map(previous.filter(n=>now-n.observedAt<retention).map(n=>[n.id,n]))
 for(const f of updates){
  if(f.onGround||f.terminal||f.source==='timetable'||now-f.observedAt>90_000||f.observedAt>now+60_000||!f.from||!f.to||!f.airlineIata&&!f.airlineIcao)continue
  const part=flightNumberPart(f.flightNumber,f.airlineIata,f.airlineIcao)
  if(!part)continue
  const number=`${f.airlineIata||f.airlineIcao}${part}`,id=`${f.airlineIcao||f.airlineIata}:${f.from}:${f.to}:${number}`,old=entries.get(id)
  if(old&&old.observedAt>f.observedAt)continue
  entries.set(id,{id,number,airlineIata:f.airlineIata,airlineIcao:f.airlineIcao,from:f.from,to:f.to,callsign:f.callsign,observedAt:f.observedAt,aircraftType:f.type||old?.aircraftType,registration:f.reg||old?.registration})
 }
 return [...entries.values()].sort((a,b)=>b.observedAt-a.observedAt).slice(0,20000)
}
export function knownRouteNumbers(rows:LearnedRouteNumber[],airline:{iata?:string;icao?:string},from:string,to:string,now=Date.now()){
 return rows.filter(n=>now-n.observedAt<retention&&n.from===from&&n.to===to&&((airline.icao&&n.airlineIcao===airline.icao)||(!airline.icao&&airline.iata&&n.airlineIata===airline.iata))&&(!airline.iata||!n.airlineIata||airline.iata===n.airlineIata))
}
export async function observedRouteNumbers(updates:ResolvedFlight[]=[]):Promise<LearnedRouteNumber[]>{
 if(typeof indexedDB==='undefined')return []
 return new Promise((resolve,reject)=>{
  const open=indexedDB.open('myroster-observed-route-numbers',1)
  open.onupgradeneeded=()=>open.result.createObjectStore('numbers',{keyPath:'id'})
  open.onerror=()=>reject(open.error);open.onblocked=()=>reject(Error('Route memory blocked'))
  open.onsuccess=()=>{const db=open.result,tx=db.transaction('numbers','readwrite'),store=tx.objectStore('numbers'),request=store.getAll();let rows:LearnedRouteNumber[]=[]
   request.onsuccess=()=>{rows=rememberRouteNumbers(request.result,updates);store.clear();for(const row of rows)store.put(row)}
   tx.oncomplete=()=>{db.close();resolve(rows)};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=tx.onerror
  }
 })
}
