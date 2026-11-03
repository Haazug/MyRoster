'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {ChevronRight,Plus} from 'lucide-react'
import {supabase} from '@/lib/supabase'
import {useT} from '@/lib/i18n'
import {listPublished,listSaved,type CustomAirline} from '@/lib/custom-airlines'
import CustomAirlineLogo from '@/components/CustomAirlineLogo'
export default function Community(){
 const t=useT(),[tab,setTab]=useState<'published'|'saved'>('published'),[rows,setRows]=useState<CustomAirline[]|null>(null),[logged,setLogged]=useState(false),[err,setErr]=useState(false)
 useEffect(()=>{supabase.auth.getSession().then(({data})=>setLogged(!!data.session)).catch(()=>{})},[])
 useEffect(()=>{
  let live=true
  setRows(null);setErr(false)
  const done=(r:CustomAirline[])=>{if(live)setRows(r)}
  const fail=()=>{if(live){setErr(true);setRows([])}}
  ;(tab==='published'?listPublished():listSaved()).then(done).catch(fail)
  return()=>{live=false}
 },[tab])
 return <section className="min-h-screen p-5 pb-32 text-white sm:p-8">
  <header className="mb-6"><h1 className="text-4xl font-semibold tracking-tight">{t('community.title')}</h1><p className="mt-2 text-white/45">{t('community.subtitle')}</p>
   <Link href="/community/new" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black"><Plus className="size-4"/>{t('community.create')}</Link></header>
  <div role="tablist" className="mb-4 flex gap-3 border-b border-white/10">{(['published','saved'] as const).map(k=><button key={k} role="tab" aria-selected={tab===k} onClick={()=>setTab(k)} className={`min-h-11 flex-1 border-b px-2 text-sm ${tab===k?'border-yellow-300 text-yellow-200':'border-transparent text-white/45'}`}>{t(`community.${k}`)}</button>)}</div>
  {tab==='saved'&&!logged&&<p className="text-sm text-white/50">{t('community.login')}</p>}
  {err&&<p className="text-sm text-yellow-200">{t('community.error')}</p>}
  {rows&&!rows.length&&!err&&(tab==='published'||logged)&&<p className="text-sm text-white/40">{t('community.empty')}</p>}
  <div className="departure-board">{(rows||[]).map(a=><Link key={a.id} href={`/community/${a.id}`} className="flex min-h-[72px] items-center gap-4 border-b border-white/[.06] py-3"><CustomAirlineLogo a={a} size={44}/><div className="min-w-0 flex-1"><p className="truncate font-semibold">{a.name}</p><p className="truncate text-xs text-white/45"><span className="text-yellow-200">{a.hub}</span> · {t('community.routeCount',{n:a.routes.length})}{a.owner_name?' · '+t('community.by',{n:a.owner_name}):''}</p></div><ChevronRight className="size-5 shrink-0 text-white/30"/></Link>)}</div>
 </section>
}
