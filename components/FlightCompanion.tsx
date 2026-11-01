'use client'
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {scheduledEvent} from '@/lib/flight-workflow'
import {updateTripStatus} from '@/lib/trip-client'
import {toast} from 'sonner'
import {supabase} from '@/lib/supabase'
import {useT} from '@/lib/i18n'
import {accountId,localActive,readCurrentFlight,flushEndedFlights,closeSharedFlight,claimFlight,deviceId,saveLocalActive,type FlightRow} from '@/lib/active-flight'
export default function FlightCompanion(){
 const t=useT(),router=useRouter()
 const [incoming,setIncoming]=useState<FlightRow|null>(null),[busy,setBusy]=useState(false)
 useEffect(()=>{
  let live=true,checkId=0,uid:string|null=null
  const check=async(force=false)=>{const attempt=++checkId;try{
   uid=await accountId();if(!uid){setIncoming(null);return}
   const forUser=uid;await flushEndedFlights(forUser);const row=await readCurrentFlight(forUser);if(!live||await accountId()!==forUser||attempt!==checkId)return
   if(force&&row)sessionStorage.removeItem(`handoff.dismiss.${uid}.${row.value.runId}.${row.value.deviceId}`)
   if(row&&!row.value.finished&&row.value.deviceId!==deviceId()&&!sessionStorage.getItem(`handoff.dismiss.${uid}.${row.value.runId}.${row.value.deviceId}`))setIncoming(row)
   else setIncoming(null)
  }catch{if(live&&attempt===checkId)setIncoming(null)}}
  check();const timer=setInterval(()=>check(),10000)
  const request=()=>check(true),refresh=()=>check();window.addEventListener('myroster:request-handoff',request);window.addEventListener('myroster:active-flight',refresh);window.addEventListener('myroster:data-changed',refresh);window.addEventListener('online',refresh);window.addEventListener('focus',refresh)
  const {data}=supabase.auth.onAuthStateChange(()=>{setIncoming(null);setTimeout(()=>check(),0)})
  return()=>{live=false;clearInterval(timer);window.removeEventListener('myroster:request-handoff',request);window.removeEventListener('myroster:active-flight',refresh);window.removeEventListener('myroster:data-changed',refresh);window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh);data.subscription.unsubscribe()}
 },[])
 useEffect(()=>{
  let checking=false,live=true
  const check=async()=>{
   if(checking)return;checking=true
   try{
    const uid=await accountId().catch(()=>null)
    let bookings:any[]=[];try{bookings=JSON.parse(localStorage.getItem('myroster.bookings')||'[]')}catch{}
    for(let b of bookings){
     if(!live||(b.accountId&&b.accountId!==uid))continue
     const active=localActive()
     if(b.scheduledAt&&b.takeoffAt===undefined&&active&&active.plan?.scheduleId===b.id&&!active.finished&&!active.takeoffAt){b={...b,takeoffAt:null};await updateTripStatus(b.id,{takeoffAt:null,status:'scheduled'},b.scheduledAt)}
     const stage=scheduledEvent(b)
     if(!stage)continue
     const key=`myroster.schedule.${uid||'guest'}.${b.id}.${b.scheduledAt}.${stage}`
     if(stage==='cancelled')await updateTripStatus(b.id,{status:'cancelled'},b.scheduledAt)
     if(localStorage.getItem(key))continue
     if(!live)continue
     localStorage.setItem(key,'1')
     const title=t(stage==='due'?'schedule.due':`schedule.${stage}`),body=`${b.flightNumber||''} ${b.orig} → ${b.dest}`
     toast(title,{description:body,duration:15000,action:{label:t('trip.open'),onClick:()=>router.push('/trips')}})
     try{if(typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification(title,{body,tag:key,icon:'/favicon.ico'})}catch{}
    }
   }finally{checking=false}
  }
  void check();const timer=setInterval(check,15000)
  document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);window.addEventListener('myroster:data-changed',check)
  return()=>{live=false;clearInterval(timer);document.removeEventListener('visibilitychange',check);window.removeEventListener('focus',check);window.removeEventListener('myroster:data-changed',check)}
 },[t,router])
 const follow=async()=>{
  if(!incoming)return;setBusy(true)
  try{const uid=await accountId();const row=uid?await claimFlight(uid,incoming.value.runId):null;if(!row){setIncoming(null);toast(t('handoff.changed'));return}
   localStorage.setItem('myroster.activePlan',JSON.stringify(row.value.plan));saveLocalActive(row.value);setIncoming(null)
   router.push(`/flights/${encodeURIComponent(row.value.flightId)}/fly?resume=${encodeURIComponent(row.value.runId)}`)
   window.dispatchEvent(new Event('myroster:resume-flight'))
  }catch{toast(t('handoff.error'))}finally{setBusy(false)}
 }
 const close=async()=>{
  if(!incoming)return;setBusy(true)
  try{
   const uid=await accountId(),row=uid?await closeSharedFlight(uid,incoming.value.runId):null
   if(row){const local=localActive();if(local?.runId===row.value.runId)saveLocalActive({...local,finished:true,endedReason:'user-ended'})}
   setIncoming(null)
   toast(t(row?'handoff.closed':'handoff.changed'))
  }catch{toast(t('handoff.error'))}finally{setBusy(false)}
 }
 if(!incoming)return null
 return <div role="dialog" aria-modal="true" aria-label={t('handoff.title')} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"><section className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#101010] p-6"><h2 className="text-xl font-medium">{t('handoff.title')}</h2><p className="mt-3 text-sm text-white/55">{incoming.value.plan.from||incoming.value.plan.orig} → {incoming.value.plan.to||incoming.value.plan.dest} · {t(`device.${incoming.value.deviceKind}`)}</p><button disabled={busy} onClick={follow} className="mt-6 min-h-11 w-full rounded-full bg-white px-4 text-sm font-medium text-black disabled:opacity-40">{t('handoff.follow')}</button><button onClick={async()=>{const uid=await accountId();sessionStorage.setItem(`handoff.dismiss.${uid}.${incoming.value.runId}.${incoming.value.deviceId}`,'1');setIncoming(null)}} className="mt-2 min-h-11 w-full text-sm text-white/45">{t('handoff.stay')}</button><button disabled={busy} onClick={close} className="mt-2 min-h-11 w-full border-t border-white/10 pt-2 text-sm text-white/65 disabled:opacity-40">{t('handoff.endOld')}</button></section></div>
}
