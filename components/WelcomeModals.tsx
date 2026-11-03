'use client'
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {supabase} from '@/lib/supabase'
import {useT} from '@/lib/i18n'
import {useLang} from '@/lib/i18n'
import {WHATS_NEW} from '@/lib/whats-new'
import {pushSupport} from '@/lib/push-client'
const SEEN='myroster.whatsnew-seen',ASKED='myroster.notif-asked'
const get=(k:string)=>{try{return localStorage.getItem(k)}catch{return null}}
const set=(k:string,v:string)=>{try{localStorage.setItem(k,v)}catch{}}
export default function WelcomeModals(){
 const t=useT(),lang=useLang(s=>s.lang)
 const [step,setStep]=useState<'none'|'new'|'notif'>('none'),[support,setSupport]=useState('loading'),[logged,setLogged]=useState(false)
 useEffect(()=>{
  setSupport(pushSupport())
  supabase.auth.getSession().then(({data})=>setLogged(!!data.session)).catch(()=>{})
  if(get(SEEN)!==WHATS_NEW.version)setStep('new')
  else if(!get(ASKED)&&typeof Notification!=='undefined'&&Notification.permission==='default')setStep('notif')
 },[])
 const closeNew=()=>{set(SEEN,WHATS_NEW.version);setStep(!get(ASKED)&&typeof Notification!=='undefined'&&Notification.permission==='default'?'notif':'none')}
 const closeNotif=()=>{set(ASKED,'1');setStep('none')}
 if(step==='none')return null
 const box="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
 const card="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b0b0b] p-5 text-white shadow-xl"
 if(step==='new')return <div className={box} role="dialog" aria-modal="true"><div className={card}>
  <h2 className="text-lg font-semibold">{t('new.title',{v:WHATS_NEW.version})}</h2>
  <ul className="mt-3 max-h-[50dvh] list-disc space-y-2 overflow-y-auto pl-5 text-sm leading-relaxed text-white/70">{WHATS_NEW.items[lang].map((x,i)=><li key={i}>{x}</li>)}</ul>
  <button onClick={closeNew} className="mt-5 min-h-11 w-full rounded-xl bg-white text-sm font-medium text-black">{t('new.close')}</button>
 </div></div>
 return <div className={box} role="dialog" aria-modal="true"><div className={card}>
  <h2 className="text-lg font-semibold">{t('notif.title')}</h2>
  <p className="mt-3 text-sm leading-relaxed text-white/70">{t('notif.body')}</p>
  {support==='install'&&<p className="mt-3 text-sm text-yellow-200">{t('notif.install')}</p>}
  <div className="mt-5 flex gap-3">
   <button onClick={closeNotif} className="min-h-11 flex-1 rounded-xl border border-white/15 text-sm">{t('notif.later')}</button>
   {support==='supported'&&<Link href={logged?'/profile#notifications':'/login?next=/profile%23notifications'} onClick={closeNotif} className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-white text-sm font-medium text-black">{t(logged?'notif.enable':'notif.login')}</Link>}
  </div>
 </div></div>
}
