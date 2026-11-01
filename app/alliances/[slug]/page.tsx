'use client'
import {useParams} from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import {ALLIANCES} from '@/lib/alliances'
import {useT} from '@/lib/i18n'
import {AirlineLogo} from '@/components/AirlineLogo'
import {fixName} from '@/lib/airline-names'
type Airline={id:string;name:string;iata:string;icao:string;alliance?:string}
export default function AlliancePage(){
 const {slug}=useParams<{slug:string}>(),t=useT(),alliance=ALLIANCES.find(a=>a.slug===slug)
 const {data,error,mutate}=useSWR<Airline[]>('/api/airlines',async (u:string)=>{const r=await fetch(u);const d=await r.json();if(!r.ok||!Array.isArray(d))throw Error('Catalog unavailable');return d})
 if(!alliance)return <section className="p-5"><Link href="/airlines">{t('back')}</Link><p>{t('alliance.missing')}</p></section>
 const members=data?.filter(a=>a.alliance===alliance.name)||[]
 return <section className="min-h-screen p-5 pb-32 sm:p-8"><Link href="/airlines" className="inline-flex min-h-11 items-center">{t('back')}</Link><h1 className="board-display mt-4 text-3xl"><span aria-hidden="true" className="mr-3 text-xl">{alliance.symbol}</span>{alliance.name}</h1><p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65">{t(alliance.key,{year:alliance.founded})}</p><h2 className="board-heading mt-8">{t('alliance.members')} · {members.length}</h2><p className="mt-2 text-xs text-white/45">{t('alliance.catalog')}</p>{error&&<button onClick={()=>mutate()} className="min-h-11">{t('live.refresh')}</button>}{!data&&!error&&<p>{t('airlines.loading')}</p>}<div className="departure-board mt-4">{members.map(a=><Link key={a.id} href={`/airlines/${a.id}`} className="flex min-h-16 items-center gap-3 py-3"><AirlineLogo iata={a.iata} icao={a.icao} name={a.name} size="sm" showText={false}/><span className="board-code">{fixName(a.name)}</span><span className="ml-auto text-xs">{a.iata} / {a.icao}</span></Link>)}</div></section>
}
