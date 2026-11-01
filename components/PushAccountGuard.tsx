'use client'
import {useEffect} from 'react'
import {supabase} from '@/lib/supabase'
import {localPushDevice,clearDevicePush} from '@/lib/push-client'
export default function PushAccountGuard(){
 useEffect(()=>{
  let live=true,busy=false
  const check=async()=>{if(!live||busy)return;busy=true;try{const {data}=await supabase.auth.getSession(),local=localPushDevice();if(local&&local.userId!==data.session?.user.id)await clearDevicePush(false)}catch{}finally{busy=false}}
  const {data}=supabase.auth.onAuthStateChange(()=>{setTimeout(check,0)})
  void check();window.addEventListener('storage',check);window.addEventListener('focus',check)
  return()=>{live=false;data.subscription.unsubscribe();window.removeEventListener('storage',check);window.removeEventListener('focus',check)}
 },[])
 return null
}
