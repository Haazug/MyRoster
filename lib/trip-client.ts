'use client'
import {supabase} from '@/lib/supabase'
function apply(rows:any[],id:string,patch:any,expectedScheduledAt?:number){return rows.map(b=>b.id!==id||(expectedScheduledAt!==undefined&&(b.scheduledAt!==expectedScheduledAt||b.takeoffAt||b.endedAt||b.status==='completed'))?b:{...b,...patch,startedAt:b.startedAt||patch.startedAt})}
function save(rows:any[]){localStorage.setItem('myroster.bookings',JSON.stringify(rows));window.dispatchEvent(new CustomEvent('myroster:data-changed',{detail:{key:'myroster.bookings'}}))}
export async function updateTripStatus(id:string,patch:{takeoffAt?:number|null;startedAt?:number;endedAt?:number;status:string;cancellationReason?:string},expectedScheduledAt?:number){
 try{
  const {data:auth}=await supabase.auth.getSession(),uid=auth.session?.user.id
  const local=JSON.parse(localStorage.getItem('myroster.bookings')||'[]')
  if(local.some((b:any)=>b.id===id&&(!b.accountId||b.accountId===uid)))save(apply(local,id,patch,expectedScheduledAt))
  if(!uid)return
  // Modify only this booking in the latest account collection; a handoff device may have no local bookings yet.
  for(let attempt=0;attempt<2;attempt++){
   const {data:previous,error}=await supabase.from('user_data').select('value,updated_at').eq('user_id',uid).eq('key','myroster.bookings').maybeSingle()
   if(error||!Array.isArray(previous?.value)||!previous.value.some((b:any)=>b.id===id))return
   const next=apply(previous.value,id,patch,expectedScheduledAt),updated_at=new Date(Math.max(Date.now(),Date.parse(previous.updated_at)+1)).toISOString()
   const {data:changed,error:writeError}=await supabase.from('user_data').update({value:next,updated_at}).eq('user_id',uid).eq('key','myroster.bookings').eq('updated_at',previous.updated_at).select('updated_at').maybeSingle()
   if(writeError)return
   if(changed){const {data:current}=await supabase.auth.getSession();if(current.session?.user.id===uid)save(next);return}
  }
 }catch{}
}
