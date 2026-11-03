'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {usePathname} from 'next/navigation'
import {X,ArrowUpRight,MapPin,Plane} from 'lucide-react'
import {useMapStore} from '@/lib/map-store'
import {useGlobeDiscovery} from '@/lib/use-globe-discovery'
import {canDiscoverGlobe,discoveryContext,type DiscoveryAirline} from '@/lib/globe-discovery'
import {useT,useLang} from '@/lib/i18n'
import {Flag} from '@/components/Flag'
import {fixName} from '@/lib/airline-names'
export default function GlobeDiscovery(){
 const path=usePathname(),exploring=useMapStore(s=>s.exploring),selection=useMapStore(s=>s.discoverySelection),select=useMapStore(s=>s.setDiscoverySelection)
 const inFlight=useMapStore(s=>s.view.mode==='route'&&typeof s.view.progress==='number')
 const active=canDiscoverGlobe(path,exploring,inFlight),{data,error,mutate}=useGlobeDiscovery(active),t=useT(),lang=useLang(s=>s.lang)
 const [query,setQuery]=useState(''),[tab,setTab]=useState<'airports'|'airlines'>('airports')
 const selectionKey=selection?`${selection.kind}:${selection.kind==='country'?selection.code:selection.id}`:''
 useEffect(()=>{setQuery('');setTab('airports')},[selectionKey])
 if(!active)return null
 const regions=new Intl.DisplayNames([lang],{type:'region'})
 const countryName=(code:string,name:string)=>/^[A-Z]{2}$/.test(code)?regions.of(code)||name:name
 const ctx=data?discoveryContext(data,selection):null
 const selectedCode=ctx?.country?.code||(selection?.kind==='country'?selection.code:'')
 const name=ctx?.airport?.name||ctx?.airline?.name||(selection?.kind==='country'?countryName(selection.code,ctx?.country?.name||selection.name||selection.code):t('discovery.title'))
 const q=query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 const matches=(values:string[])=>values.join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)
 const airportRows=(ctx?.airline?data?.airports.filter(a=>ctx.airline!.hubs.includes(a.iata)):ctx?.airports)||[]
 const airlineRows=(ctx?.airlines||[]).filter(a=>matches([a.name,a.iata,a.icao,a.country]))
 const home=ctx?.airport?.countryCode
 const national=home?airlineRows.filter(a=>a.countryCode===home).sort((a,b)=>b.numRoutes-a.numRoutes):[]
 const others=home?airlineRows.filter(a=>a.countryCode!==home):airlineRows
 const airlineRow=(a:DiscoveryAirline)=><button key={a.id} onClick={()=>select({kind:'airline',id:a.id})} className="flex min-h-14 w-full items-center gap-3 border-b border-yellow-300/10 px-2 py-3 text-left"><Flag country={a.country} size={16}/><span className="min-w-0 flex-1"><span className="block truncate text-sm">{fixName(a.name)}</span><span className="mt-1 block font-mono text-[11px] text-white/40">{a.iata} / {a.icao}{a.alliance?` · ${a.alliance}`:''}</span></span></button>
 return <aside aria-label={t('discovery.title')} className={`fixed z-40 overflow-hidden rounded-2xl border border-white/15 bg-black/90 text-white shadow-xl backdrop-blur-xl ${selection?'bottom-40 left-3 right-3 max-h-[48dvh] sm:bottom-auto sm:left-auto sm:right-4 sm:top-20 sm:max-h-[calc(100dvh-180px)] sm:w-96':'left-3 right-3 top-16 sm:left-auto sm:right-4 sm:top-20 sm:w-96'}`}>
  <div className="flex max-h-[inherit] flex-col">
   <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2"><h2 className="min-w-0 flex-1 text-sm font-medium">{name}</h2>{selection&&<button aria-label={t('discovery.close')} onClick={()=>select(null)} className="flex size-11 shrink-0 items-center justify-center text-white/55"><X className="size-4"/></button>}</header>
   <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
    {error?<div role="status" className="text-sm text-white/50">{t('discovery.error')}<button onClick={()=>mutate()} className="ml-2 min-h-11 underline">{t('live.refresh')}</button></div>:!data?<p role="status" className="text-sm text-white/50">{t('discovery.loading')}</p>:<>
     <label className="block text-xs text-white/50">{t('discovery.country')}<select aria-label={t('discovery.country')} value={data.countries.some(c=>c.code===selectedCode)?selectedCode:''} onChange={e=>{const c=data.countries.find(c=>c.code===e.target.value);select(c?{kind:'country',code:c.code,name:c.name,lat:c.lat,lon:c.lon}:null)}} className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-[#111] px-3 text-sm text-white"><option value="">{t('discovery.chooseCountry')}</option>{[...data.countries].sort((a,b)=>countryName(a.code,a.name).localeCompare(countryName(b.code,b.name),lang)).map(c=><option key={c.code} value={c.code}>{countryName(c.code,c.name)}</option>)}</select></label>
     {!selection&&<p className="mt-3 text-xs leading-relaxed text-white/50">{t('discovery.hint')}</p>}
     {ctx?.airport&&<div className="mt-4"><p className="board-heading">{ctx.airport.iata} · {ctx.airport.icao}</p><p className="mt-2 text-sm leading-relaxed text-white/65">{t('discovery.airportDescription',{city:ctx.airport.city,country:countryName(ctx.airport.countryCode,ctx.airport.country),n:ctx.airport.destinations})}</p><Link href={`/airports/${ctx.airport.iata}`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-yellow-200">{t('discovery.openAirport')}<ArrowUpRight className="size-4"/></Link></div>}
     {ctx?.airline&&<div className="mt-4"><p className="board-heading">{ctx.airline.iata} · {ctx.airline.icao}</p><p className="mt-2 text-sm leading-relaxed text-white/65">{t('discovery.airlineDescription',{country:countryName(ctx.airline.countryCode,ctx.airline.country),n:ctx.airline.numRoutes})}</p>{ctx.airline.alliance&&<p className="mt-2 text-xs text-white/50">{ctx.airline.alliance}</p>}<Link href={`/airlines/${encodeURIComponent(ctx.airline.id)}`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-yellow-200">{t('discovery.openAirline')}<ArrowUpRight className="size-4"/></Link></div>}
     {selection&&<>
      {selection.kind==='country'&&<div role="tablist" aria-label={t('discovery.title')} className="mt-4 flex gap-3 border-b border-white/10">{(['airports','airlines'] as const).map(key=><button key={key} role="tab" aria-selected={tab===key} onClick={()=>{setTab(key);setQuery('')}} className={`min-h-11 flex-1 border-b px-2 text-xs ${tab===key?'border-yellow-300 text-yellow-200':'border-transparent text-white/45'}`}>{t(key==='airports'?'airports.title':'nav.airlines')} · {key==='airports'?airportRows.length:ctx?.airlines.length||0}</button>)}</div>}
      <label className="mt-4 block"><span className="sr-only">{t('discovery.filter')}</span><input aria-label={t('discovery.filter')} value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('discovery.filter')} className="min-h-11 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm outline-none placeholder:text-white/30"/></label>
      {!ctx?.airport&&(ctx?.airline||tab==='airports')&&<><h3 className="board-heading mb-2 mt-5 flex items-center gap-2 text-xs"><MapPin className="size-3.5"/>{t(ctx?.airline?'discovery.hubs':'airports.title')} · {airportRows.length}</h3><div className="departure-board">{airportRows.filter(a=>matches([a.iata,a.icao,a.city,a.name])).map(a=><button key={a.iata} onClick={()=>select({kind:'airport',id:a.iata})} className="flex min-h-14 w-full items-center gap-3 border-b border-yellow-300/10 px-2 py-3 text-left"><span className="board-code w-10 shrink-0 text-sm">{a.iata}</span><span className="min-w-0"><span className="block truncate text-sm">{a.city}</span><span className="mt-1 block truncate text-[11px] text-white/40">{a.name}</span></span></button>)}</div>{!airportRows.length&&<p className="py-3 text-xs text-white/40">{t('discovery.noAirports')}</p>}</>}
      {!ctx?.airline&&(ctx?.airport||tab==='airlines')&&<>
       {national.length>0&&<><h3 className="board-heading mb-2 mt-5 flex items-center gap-2 text-xs"><Plane className="size-3.5"/>{t(national.length===1?'discovery.national':'discovery.nationals')} · {national.length}</h3><div className="departure-board">{national.map(airlineRow)}</div></>}
       {others.length>0&&<><h3 className="board-heading mb-2 mt-5 flex items-center gap-2 text-xs"><Plane className="size-3.5"/>{t(home?(national.length?'discovery.otherAirlines':'discovery.servingAirlines'):'discovery.basedAirlines')} · {others.length}</h3>{home&&national.length>0&&<p className="mb-2 text-[11px] leading-relaxed text-white/40">{t('discovery.otherHint')}</p>}<div className="departure-board">{others.map(airlineRow)}</div></>}
       {!airlineRows.length&&<p className="py-3 text-xs text-white/40">{t('discovery.noAirlines')}</p>}
      </>}
      <p className="mt-5 text-[10px] leading-relaxed text-white/35">{t('catalog.reference')}</p>
     </>}
    </>}
   </div>
  </div>
 </aside>
}
