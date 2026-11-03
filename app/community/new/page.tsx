'use client'
import Link from 'next/link'
import {useEffect,useMemo,useState} from 'react'
import {useRouter} from 'next/navigation'
import {X} from 'lucide-react'
import {supabase} from '@/lib/supabase'
import {useT} from '@/lib/i18n'
import {useGlobeDiscovery} from '@/lib/use-globe-discovery'
import {SHAPES,badName,publishAirline,type Shape} from '@/lib/custom-airlines'
import {getProfile} from '@/lib/pilot-profile'
import CustomAirlineLogo from '@/components/CustomAirlineLogo'
import AirportPicker from '@/components/AirportPicker'
import BackLink from '@/components/BackLink'
export default function NewAirline(){
 const t=useT(),router=useRouter(),{data}=useGlobeDiscovery(true)
 const [logged,setLogged]=useState<boolean|null>(null)
 const [name,setName]=useState(''),[initials,setInitials]=useState(''),[shape,setShape]=useState<Shape>('circle'),[c1,setC1]=useState('#1f88ff'),[c2,setC2]=useState('#ffffff')
 const [hub,setHub]=useState(''),[dests,setDests]=useState<string[]>([]),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{supabase.auth.getSession().then(({data:s})=>setLogged(!!s.session)).catch(()=>setLogged(false))},[])
 const airports=data?.airports||[]
 const city=(i:string)=>airports.find(a=>a.iata===i)?.city||i
 const ini=useMemo(()=>(initials||name.replace(/[^A-Za-z0-9 ]/g,'').split(' ').filter(Boolean).map(w=>w[0]).join('')).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3),[initials,name])
 const publish=async()=>{
  const n=name.trim()
  if(n.length<2||n.length>40||!/^[A-Z0-9]{1,3}$/.test(ini))return setMsg('community.needName')
  if(badName(n))return setMsg('community.badName')
  if(!hub)return setMsg('community.needHub')
  if(!dests.length)return setMsg('community.needRoutes')
  setBusy(true);setMsg('')
  try{
   const p=getProfile()
   const id=await publishAirline({name:n,initials:ini,shape,color1:c1,color2:c2,hub,routes:dests.map(to=>({from:hub,to})),owner_name:p?.username||p?.name||null})
   router.push(`/community/${id}`)
  }catch(e){setMsg(String((e as {message?:string})?.message||'').includes('limit')?'community.limit':'community.error')}finally{setBusy(false)}
 }
 const field='min-h-11 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm outline-none placeholder:text-white/30'
 const label='mb-2 block text-xs text-white/50'
 if(logged===false)return <section className="min-h-screen p-5 text-white sm:p-8"><BackLink href="/community" className="inline-flex min-h-11 items-center text-sm text-white/55">←</BackLink><h1 className="mt-6 text-3xl font-semibold">{t('community.create')}</h1><p className="mt-3 text-sm text-white/50">{t('community.login')}</p><Link href="/login?next=/community/new" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-white px-6 text-sm font-semibold text-black">{t('community.loginBtn')}</Link></section>
 return <section className="min-h-screen p-5 pb-32 text-white sm:p-8">
  <BackLink href="/community" className="inline-flex min-h-11 items-center text-sm text-white/55">←</BackLink>
  <h1 className="mt-6 text-3xl font-semibold tracking-tight">{t('community.create')}</h1>
  <div className="mt-6 flex items-center gap-4"><CustomAirlineLogo a={{initials:ini||'?',shape,color1:c1,color2:c2}} size={72}/><p className="min-w-0 truncate text-lg font-semibold">{name||'—'}</p></div>
  <label className="mt-6 block"><span className={label}>{t('community.name')}</span><input value={name} maxLength={40} onChange={e=>setName(e.target.value)} className={field}/></label>
  <label className="mt-4 block"><span className={label}>{t('community.initials')}</span><input value={initials} placeholder={ini} onChange={e=>setInitials(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3))} className={field}/></label>
  <p className={`${label} mt-5`}>{t('community.shape')}</p>
  <div className="flex gap-3">{SHAPES.map(s=><button key={s} type="button" aria-pressed={shape===s} onClick={()=>setShape(s)} className={`rounded-xl border p-2 ${shape===s?'border-yellow-300':'border-white/10'}`}><CustomAirlineLogo a={{initials:ini||'?',shape:s,color1:c1,color2:c2}} size={44}/></button>)}</div>
  <p className={`${label} mt-5`}>{t('community.colors')}</p>
  <div className="flex gap-4"><input type="color" aria-label="1" value={c1} onChange={e=>setC1(e.target.value)} className="h-11 w-16 rounded-lg border border-white/10 bg-transparent"/><input type="color" aria-label="2" value={c2} onChange={e=>setC2(e.target.value)} className="h-11 w-16 rounded-lg border border-white/10 bg-transparent"/></div>
  <p className={`${label} mt-6`}>{t('community.hub')}</p>
  {hub&&<p className="mb-2 inline-flex items-center gap-2 rounded-full border border-yellow-300/50 px-3 py-1 text-sm text-yellow-200"><span className="board-code">{hub}</span>{city(hub)}</p>}
  <AirportPicker airports={airports} placeholder={t('community.search')} onPick={i=>{setHub(i);setDests(d=>d.filter(x=>x!==i))}}/>
  <p className={`${label} mt-6`}>{t('community.routes')} · {dests.length}</p>
  <div className="mb-2 flex flex-wrap gap-2">{dests.map(d=><span key={d} className="inline-flex items-center gap-2 rounded-full border border-white/15 py-1 pl-3 pr-1 text-sm"><span className="board-code">{d}</span><span className="text-white/50">{city(d)}</span><button type="button" aria-label="remove" onClick={()=>setDests(x=>x.filter(y=>y!==d))} className="flex size-8 items-center justify-center text-white/50"><X className="size-4"/></button></span>)}</div>
  <AirportPicker airports={airports} placeholder={t('community.search')} onPick={i=>{if(i!==hub)setDests(d=>d.includes(i)||d.length>=60?d:[...d,i])}}/>
  {msg&&<p role="status" className="mt-5 text-sm text-yellow-200">{t(msg)}</p>}
  <button onClick={publish} disabled={busy||logged!==true} className="mt-6 min-h-12 w-full rounded-full bg-white text-sm font-semibold text-black disabled:opacity-40">{t('community.publish')}</button>
 </section>
}
