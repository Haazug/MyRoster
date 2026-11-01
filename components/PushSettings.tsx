'use client'
import {useEffect,useState,useRef} from 'react'
import Link from 'next/link'
import {supabase} from '@/lib/supabase'
import {useT,useLang} from '@/lib/i18n'
import {PUSH_STAGES,DEFAULT_PUSH_PREFERENCES,pushPreferences,type PushPreferences} from '@/lib/push-model'
import {applicationKey,pushRequest,pushOwner,pushSupport,localPushDevice,rememberPush,clearDevicePush} from '@/lib/push-client'

type Config={configured:boolean;publicKey?:string;schedulerReady:boolean;lastRun?:string|null}
export default function PushSettings(){
 const busyRef=useRef(false)
 const t=useT(),language=useLang(s=>s.lang)
 const [support,setSupport]=useState('loading'),[config,setConfig]=useState<Config|null>(null),[userId,setUserId]=useState<string|null>(null)
 const [id,setId]=useState<string|null>(null),[preferences,setPreferences]=useState<PushPreferences>({...DEFAULT_PUSH_PREFERENCES}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[denied,setDenied]=useState(false)
 useEffect(()=>{
  let live=true,revision=0
  const load=async()=>{if(busyRef.current)return;const attempt=++revision;try{
   const response=await fetch('/api/push/config',{cache:'no-store'});if(!response.ok)throw Error('unavailable');const cfg:Config=await response.json()
   const {data}=await supabase.auth.getSession();if(!live||attempt!==revision)return
   setConfig(cfg);setSupport(pushSupport());setUserId(data.session?.user.id||null);setDenied(typeof Notification!=='undefined'&&Notification.permission==='denied');setId(null)
   if(!data.session||!cfg.configured||!('serviceWorker' in navigator))return
   const registration=await navigator.serviceWorker.getRegistration('/'),subscription=await registration?.pushManager.getSubscription()
   if(!subscription){if(localPushDevice()?.userId===data.session.user.id)rememberPush(null);return}
   const result=await pushRequest('/api/push/subscriptions')
   if(!live||attempt!==revision)return
   const own=result.subscriptions.find((s:any)=>s.endpoint===subscription.endpoint&&s.vapid_public_key===cfg.publicKey)
   if(own){const prefs=pushPreferences(own.preferences);setId(own.id);setPreferences(prefs);await pushOwner(registration!,{userId:data.session.user.id,subscriptionId:own.id});rememberPush({userId:data.session.user.id,subscriptionId:own.id,preferences:prefs})}else if(localPushDevice()?.userId===data.session.user.id){rememberPush(null);await pushOwner(registration!,null)}
  }catch{if(live&&attempt===revision){setMessage('push.error');setSupport(pushSupport())}}}
  const refresh=()=>{void load()};void load()
  const {data}=supabase.auth.onAuthStateChange(()=>setTimeout(refresh,0));window.addEventListener('focus',refresh)
  return()=>{live=false;revision++;data.subscription.unsubscribe();window.removeEventListener('focus',refresh)}
 },[])
 const working=(value:boolean)=>{busyRef.current=value;setBusy(value)}
 const enable=async()=>{
  if(!config?.publicKey||!userId||support!=='supported')return
  working(true);setMessage('')
  // Invoke the native permission request directly from this click, before network/authentication awaits.
  const permission=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission)
  try{
   const granted=await permission;if(granted!=='granted'){setDenied(granted==='denied');setMessage('push.denied');return}
   const registration=await navigator.serviceWorker.register('/push-sw.js',{scope:'/'})
   await navigator.serviceWorker.ready
   let subscription=await registration.pushManager.getSubscription()
   const key=applicationKey(config.publicKey),current=subscription?.options.applicationServerKey
   if(subscription&&(!current||Array.from(new Uint8Array(current)).join(',')!==Array.from(key).join(','))){await subscription.unsubscribe();subscription=null}
   if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key})
   const {data}=await supabase.auth.getSession();if(data.session?.user.id!==userId)throw Error('login')
   const result=await pushRequest('/api/push/subscriptions','POST',{subscription:subscription.toJSON(),preferences,language})
   await pushOwner(registration,{userId,subscriptionId:result.id});rememberPush({userId,subscriptionId:result.id,preferences});setId(result.id);setMessage('')
  }catch(error){setMessage(error instanceof Error&&error.message==='login'?'push.login':'push.error')}finally{working(false)}
 }
 const save=async()=>{if(!id||!userId)return;working(true);try{await pushRequest('/api/push/subscriptions','PATCH',{id,preferences,language});rememberPush({userId,subscriptionId:id,preferences});setMessage('push.saved')}catch{setMessage('push.error')}finally{working(false)}}
 const disable=async()=>{working(true);try{await clearDevicePush();setId(null);setMessage('push.disabled')}catch{setId(null);setMessage('push.disableError')}finally{working(false)}}
 const test=async()=>{working(true);try{await pushRequest('/api/push/test','POST',{id});setMessage('push.testSent')}catch(error){setMessage(error instanceof Error&&error.message==='rateLimit'?'push.rateLimit':'push.error')}finally{working(false)}}
 return <section id="notifications" className="mt-6 scroll-mt-16 rounded-2xl border border-white/10 p-5"><h2 className="text-xl font-semibold">{t('push.title')}</h2><p className="mt-3 text-sm leading-relaxed text-white/60">{t('push.description')}</p>
  {support==='install'&&<p className="mt-3 text-sm text-yellow-200">{t('push.install')}</p>}
  {support==='unsupported'&&<p className="mt-3 text-sm text-amber-200">{t('push.unsupported')}</p>}
  {config&&!config.configured&&<p className="mt-3 text-sm text-amber-200">{t('push.notConfigured')}</p>}
  {config?.configured&&!config.schedulerReady&&<p className="mt-3 text-sm text-amber-200">{t('push.schedulerPending')}</p>}
  {id&&!denied&&<p className="mt-3 text-sm text-green-200">{t('push.enabled')}</p>}
  {denied&&<p className="mt-3 text-sm text-amber-200">{t('push.denied')}</p>}
  {!userId&&support!=='loading'&&<Link href="/login?next=/profile%23notifications" className="mt-3 inline-flex min-h-11 items-center text-yellow-200">{t('push.login')}</Link>}
  <fieldset disabled={busy} className="mt-4 space-y-1"><legend className="mb-2 text-sm text-white/70">{t('push.choose')}</legend>{PUSH_STAGES.map(stage=><label key={stage} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={preferences[stage]} onChange={e=>setPreferences(p=>({...p,[stage]:e.target.checked}))}/>{t(`push.${stage}`)}</label>)}</fieldset>
  <div className="mt-4 flex flex-wrap gap-3">{id?<><button disabled={busy} onClick={save} className="min-h-11 rounded-xl bg-white px-4 text-sm text-black disabled:opacity-40">{t('push.save')}</button><button disabled={busy} onClick={test} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm disabled:opacity-40">{t('push.test')}</button><button disabled={busy} onClick={disable} className="min-h-11 px-3 text-sm text-white/50 disabled:opacity-40">{t('push.disable')}</button></>:<button disabled={busy||!userId||!config?.configured||support!=='supported'||denied} onClick={enable} className="min-h-11 rounded-xl bg-white px-4 text-sm text-black disabled:opacity-40">{t('push.enable')}</button>}</div>
  {message&&<p role="status" className="mt-3 text-sm text-yellow-200">{t(message)}</p>}<p className="mt-4 text-xs leading-relaxed text-white/45">{t('push.limits')}</p>
 </section>
}
