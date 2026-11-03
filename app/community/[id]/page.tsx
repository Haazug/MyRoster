'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {useParams,useRouter} from 'next/navigation'
import {Bookmark,Flag,Share2,Trash2} from 'lucide-react'
import {supabase} from '@/lib/supabase'
import {useT} from '@/lib/i18n'
import {useMapStore,type Point} from '@/lib/map-store'
import {useGlobeDiscovery} from '@/lib/use-globe-discovery'
import {getAirline,isSaved,setSaved,reportAirline,deleteAirline,type CustomAirline} from '@/lib/custom-airlines'
import CustomAirlineLogo from '@/components/CustomAirlineLogo'
import BackLink from '@/components/BackLink'
export default function CommunityAirline(){
 const t=useT(),router=useRouter(),{id}=useParams<{id:string}>(),setView=useMapStore(s=>s.setView),{data}=useGlobeDiscovery(true)
 const [a,setA]=useState<CustomAirline|null|undefined>(undefined),[uid,setUid]=useState<string|null>(null),[saved,setSavedState]=useState(false),[note,setNote]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{
  let live=true
  getAirline(id).then(r=>{if(live)setA(r)}).catch(()=>{if(live)setA(null)})
  supabase.auth.getSession().then(({data:s})=>{if(live)setUid(s.session?.user.id||null)}).catch(()=>{})
  isSaved(id).then(v=>{if(live)setSavedState(v)}).catch(()=>{})
  return()=>{live=false}
 },[id])
 useEffect(()=>{
  if(!a||!data)return
  const by=new Map<string,Point>(data.airports.map(x=>[x.iata,x as unknown as Point]))
  const hubP=by.get(a.hub)
  const routes=a.routes.map(r=>({from:by.get(r.from),to:by.get(r.to)})).filter((r):r is {from:Point;to:Point}=>!!r.from&&!!r.to)
  setView({mode:'airline',routes,hubs:hubP?[hubP]:undefined})
  return()=>setView({mode:'idle'})
 },[a,data,setView])
 const city=(i:string)=>data?.airports.find(x=>x.iata===i)?.city||''
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setNote('');try{await fn()}catch{setNote('community.error')}finally{setBusy(false)}}
 if(a===undefined)return <section className="min-h-screen p-5 text-white/40 sm:p-8">…</section>
 if(a===null)return <section className="min-h-screen p-5 text-white sm:p-8"><BackLink href="/community" className="inline-flex min-h-11 items-center text-sm text-white/55">←</BackLink><p className="mt-6 text-white/60">{t('community.notFound')}</p></section>
 const btn='flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm disabled:opacity-40'
 return <section className="min-h-screen p-5 pb-32 text-white sm:p-8">
  <BackLink href="/community" className="inline-flex min-h-11 items-center text-sm text-white/55">←</BackLink>
  <header className="mt-6 flex items-center gap-4 border-b border-white/10 pb-6">
   <CustomAirlineLogo a={a} size={72}/>
   <div className="min-w-0"><h1 className="truncate text-3xl font-semibold tracking-tight">{a.name}</h1>
    <p className="mt-1 text-sm text-white/45">{a.owner_name?t('community.by',{n:a.owner_name})+' · ':''}<span className="text-yellow-200">{a.hub}</span> · {t('community.routeCount',{n:a.routes.length})}</p></div>
  </header>
  <div className="mt-5 flex flex-wrap gap-2">
   {uid?<button disabled={busy} onClick={()=>run(async()=>{await setSaved(a.id,!saved);setSavedState(!saved)})} className={btn}><Bookmark className={`size-4 ${saved?'fill-current':''}`}/>{t(saved?'community.savedOne':'community.save')}</button>:<Link href={`/login?next=/community/${a.id}`} className={btn}>{t('community.loginBtn')}</Link>}
   <button disabled={busy} onClick={()=>run(async()=>{const url=`${location.origin}/community/${a.id}`;if(navigator.share){await navigator.share({title:a.name,url});return}await navigator.clipboard.writeText(url);setNote('community.copied')})} className={btn}><Share2 className="size-4"/>{t('community.share')}</button>
   {uid&&uid!==a.owner&&<button disabled={busy} onClick={()=>{if(confirm(t('community.confirmReport')))run(async()=>{await reportAirline(a.id);setNote('community.reported')})}} className={btn}><Flag className="size-4"/>{t('community.report')}</button>}
   {uid===a.owner&&<button disabled={busy} onClick={()=>{if(confirm(t('community.confirmDelete')))run(async()=>{await deleteAirline(a.id);router.push('/community')})}} className={btn}><Trash2 className="size-4"/>{t('community.delete')}</button>}
  </div>
  {note&&<p role="status" className="mt-3 text-sm text-yellow-200">{t(note)}</p>}
  <div className="departure-board mt-6">{a.routes.map(r=><div key={r.to} className="flex min-h-12 items-center gap-3 border-b border-white/[.06] py-2 text-sm"><span className="board-code w-10 shrink-0 text-yellow-200">{r.from}</span><span className="text-white/30">→</span><span className="board-code w-10 shrink-0">{r.to}</span><span className="min-w-0 truncate text-white/50">{city(r.to)}</span></div>)}</div>
 </section>
}
