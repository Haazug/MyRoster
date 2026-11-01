'use client'
import {supabase} from '@/lib/supabase'
import type {PushPreferences} from './push-model'
export const PUSH_LOCAL_KEY='myroster.push-device'
export type PushDevice={userId:string;subscriptionId:string;preferences:PushPreferences}
export function localPushDevice():PushDevice|null{try{return JSON.parse(localStorage.getItem(PUSH_LOCAL_KEY)||'null')}catch{return null}}
export function rememberPush(device:PushDevice|null){if(device)localStorage.setItem(PUSH_LOCAL_KEY,JSON.stringify(device));else localStorage.removeItem(PUSH_LOCAL_KEY);window.dispatchEvent(new Event('myroster:push-changed'))}
export function pushSupport(){
 if(typeof window==='undefined')return 'loading'
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1)
 const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true
 if(ios&&!standalone)return 'install'
 return window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window?'supported':'unsupported'
}
export function applicationKey(key:string){const value=atob(key.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(value,c=>c.charCodeAt(0))}
export async function pushRequest(path:string,method='GET',body?:unknown){
 const {data}=await supabase.auth.getSession();if(!data.session)throw Error('login')
 const response=await fetch(path,{method,headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
 const result=await response.json();if(!response.ok)throw Error(response.status===429?'rateLimit':result.error||'error')
 return result
}
export async function pushOwner(registration:ServiceWorkerRegistration,owner:Pick<PushDevice,'userId'|'subscriptionId'>|null){
 const worker=registration.active;if(!worker)throw Error('error')
 await new Promise<void>((resolve,reject)=>{
  const channel=new MessageChannel(),timeout=setTimeout(()=>{channel.port1.close();reject(Error('error'))},5000)
  channel.port1.onmessage=e=>{clearTimeout(timeout);channel.port1.close();e.data?.ok?resolve():reject(Error('error'))}
  worker.postMessage({type:'myroster:push-owner',owner},[channel.port2])
 })
}
export async function clearDevicePush(removeServer=true){
 const local=localPushDevice()
 if('serviceWorker' in navigator){
  const registration=await navigator.serviceWorker.getRegistration('/')
  if(registration){try{await pushOwner(registration,null)}finally{const subscription=await registration.pushManager.getSubscription();if(subscription)await subscription.unsubscribe()}}
 }
 rememberPush(null)
 if(removeServer&&local)await pushRequest('/api/push/subscriptions','DELETE',{id:local.subscriptionId})
}
