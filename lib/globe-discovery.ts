import {globeNavAllowed} from './globe-rules'
import type {Db} from './openflights-parse'
import {isoOf} from './flags'
import {allianceFor} from './airline-metadata'
import {hubRoutes,mergeRoutes} from './route-merge'
export type DiscoverySelection={kind:'country';code:string;name?:string;lat?:number;lon?:number}|{kind:'airport';id:string}|{kind:'airline';id:string}
export type DiscoveryAirport={iata:string;icao:string;name:string;city:string;country:string;countryCode:string;lat:number;lon:number;destinations:number;airlineIds:string[]}
export type DiscoveryAirline={id:string;name:string;iata:string;icao:string;country:string;countryCode:string;alliance:string|null;hubs:string[];numRoutes:number}
export type DiscoveryCountry={code:string;name:string;airports:number;airlines:number;lat:number;lon:number}
export type DiscoveryCatalog={airports:DiscoveryAirport[];airlines:DiscoveryAirline[];countries:DiscoveryCountry[]}
export const countryCode=(name:string)=>isoOf(name)||name
export function canDiscoverGlobe(path:string,exploring:boolean,inFlight=false){return exploring&&globeNavAllowed(path,inFlight)}
export function buildGlobeDiscovery(db:Db):DiscoveryCatalog{
 const hubs:Map<string,string[]>=(db as Db&{hubs?:Map<string,string[]>}).hubs||new Map()
 const airlines:DiscoveryAirline[]=[...db.airlines.values()].filter(a=>a.active).map(a=>({...a,countryCode:countryCode(a.country),alliance:allianceFor(a.icao),hubs:hubs.get(a.id)||[],numRoutes:mergeRoutes(hubRoutes(db.routesByAirline.get(a.id)||[],hubs.get(a.id)||[])).length})).filter(a=>a.numRoutes>0)
 const available=new Set(airlines.map(a=>a.id))
 const airports:DiscoveryAirport[]=[...db.airports.values()].filter(a=>Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&Math.abs(a.lat)<=90&&Math.abs(a.lon)<=180).map(a=>{
  const routes=db.routesByAirport.get(a.iata)||[]
  return {...a,countryCode:countryCode(a.country),destinations:new Set(routes.map(r=>r.from===a.iata?r.to:r.from)).size,airlineIds:[...new Set(routes.map(r=>r.airlineId))].filter(id=>available.has(id))}
 }).filter(a=>a.destinations>0).sort((a,b)=>b.destinations-a.destinations)
 const countries=new Map<string,DiscoveryCountry>()
 for(const a of airports){let c=countries.get(a.countryCode);if(!c){c={code:a.countryCode,name:a.country,airports:0,airlines:0,lat:a.lat,lon:a.lon};countries.set(c.code,c)}c.airports++}
 for(const a of airlines){const c=countries.get(a.countryCode);if(c)c.airlines++}
 return {airports,airlines,countries:[...countries.values()].sort((a,b)=>a.name.localeCompare(b.name))}
}
export function discoveryContext(data:DiscoveryCatalog,selection:DiscoverySelection|null){
 const airport=selection?.kind==='airport'?data.airports.find(a=>a.iata===selection.id):undefined
 const airline=selection?.kind==='airline'?data.airlines.find(a=>a.id===selection.id):undefined
 const code=selection?.kind==='country'?selection.code:airport?.countryCode||airline?.countryCode
 const country=data.countries.find(c=>c.code===code)
 return {airport,airline,country,airports:code?data.airports.filter(a=>a.countryCode===code):[],airlines:airport?data.airlines.filter(a=>airport.airlineIds.includes(a.id)):code?data.airlines.filter(a=>a.countryCode===code):[]}
}
