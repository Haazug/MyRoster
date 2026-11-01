import {parsePLNFile,type ParsedFlightPlan} from './flight-plan-parser'

export const MAX_IMPORT_BYTES=2_000_000
export function msfsShareUrl(input:string){
 const url=new URL(input.trim())
 if(url.protocol!=='https:'||url.hostname!=='planner.flightsimulator.com'||url.port||url.username||url.password||!/^\/share\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(url.pathname))throw Error('Invalid MSFS share link')
 return url.origin+url.pathname
}
const code=(value:any):string=>{
 const v=typeof value==='string'?value:value?.icao||value?.icaoCode||value?.icao_code||value?.ident||value?.iata||value?.iataCode||value?.code||value?.airport
 if(typeof v!=='string'||! /^[A-Z0-9]{3,4}$/i.test(v.trim()))throw Error('Missing airport code')
 return v.trim().toUpperCase()
}
// RFC 4180 fields, including quoted commas, escaped quotes and multiline values.
export function csvRows(text:string){
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(field);field=''}else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field=''}else field+=c}
 if(quoted)throw Error('Invalid CSV');row.push(field);if(row.some(Boolean))rows.push(row);return rows
}
const key=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'')
export function parseRouteData(text:string):ParsedFlightPlan[]{
 if(new TextEncoder().encode(text).length>MAX_IMPORT_BYTES)throw Error('Import too large')
 text=text.replace(/^\uFEFF/,'').trim()
 if(text.startsWith('<')){const plan=parsePLNFile(text);code(plan.departure);code(plan.arrival);if(plan.departure===plan.arrival||plan.waypoints.some(w=>!Number.isFinite(w.latitude)||!Number.isFinite(w.longitude)||Math.abs(w.latitude)>90||Math.abs(w.longitude)>180))throw Error('Invalid PLN');return [plan]}
 let rows:any[]
 if(text.startsWith('{')||text.startsWith('[')){
  const data=JSON.parse(text)
  if(typeof data.pln==='string'||typeof data.flightPlan==='string')return parseRouteData(data.pln||data.flightPlan)
  const value=data.flights||data.routes||data.data?.flights||data.data||data.flightPlan||data.flight||data
  rows=Array.isArray(value)?value:[value]
 }else{
  const [header,...values]=csvRows(text);if(!header||!values.length)throw Error('Empty CSV')
  rows=values.map(row=>Object.fromEntries(header.map((h,i)=>[key(h),row[i]||''])))
 }
 if(!rows.length||rows.length>500)throw Error('Invalid route count')
 return rows.map(raw=>{
  const r=Object.fromEntries(Object.entries(raw).map(([k,v])=>[key(k),v])) as Record<string,any>
  const departure=code(r.departure||r.departureairport||r.departureicao||r.origin||r.originicao||r.from)
  const arrival=code(r.arrival||r.arrivalairport||r.arrivalicao||r.destination||r.destinationicao||r.to)
  if(departure===arrival)throw Error('Identical endpoints')
  const points=r.waypoints||r.route?.waypoints||[]
  if(!Array.isArray(points)||points.length>5000)throw Error('Invalid waypoints')
  const waypoints=points.map((w:any,i:number)=>{
   const latitude=Number(w.latitude??w.lat),longitude=Number(w.longitude??w.lon??w.lng)
   if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw Error('Invalid coordinates')
   return {id:String(w.id||w.ident||`WP${i}`),latitude,longitude}
  })
  const positive=(v:any,fallback:number)=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):fallback
  return {departure,arrival,aircraft:String(r.aircraft?.icao||r.aircraft?.type||r.aircrafttype||r.aircraft||''),cruiseAltitude:positive(r.cruisealtitude||r.altitude,35000),distance:positive(r.distancenm||r.distance,0),estimatedTime:positive(r.durationmin||r.estimatedtime,0),waypoints,flightNumber:String(r.flightnumber||r.callsign||'')}
 })
}
