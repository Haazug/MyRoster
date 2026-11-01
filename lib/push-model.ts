import {scheduledEvent,hasDeparted,type ScheduledTrip} from './flight-workflow'

export const PUSH_STAGES=['checkin','doors','due','disembark','cancelled'] as const
export type PushStage=typeof PUSH_STAGES[number]
export type PushPreferences=Record<PushStage,boolean>
export const DEFAULT_PUSH_PREFERENCES:PushPreferences={checkin:true,doors:true,due:true,disembark:true,cancelled:true}
export function pushPreferences(value:unknown):PushPreferences{
 const input=value&&typeof value==='object'?value as Record<string,unknown>:{}
 return Object.fromEntries(PUSH_STAGES.map(k=>[k,typeof input[k]==='boolean'?input[k]:true])) as PushPreferences
}
export function pushStage(f:ScheduledTrip&{cancellationReason?:string},now=Date.now()):PushStage|null{
 if(!Number.isFinite(f.scheduledAt)||!f.scheduledAt||hasDeparted(f)||f.endedAt||f.status==='completed'||now>f.scheduledAt+24*3600_000)return null
 if(f.status==='cancelled'&&f.cancellationReason!=='missed-departure')return null
 return scheduledEvent(f.status==='cancelled'?{...f,status:'scheduled'}:f,now)
}
export const scheduleTag=(userId:string,id:string,at:number,stage:string)=>`myroster.schedule.${userId}.${id}.${at}.${stage}`
export function validPushSubscription(value:any){
 try{
  const u=new URL(value.endpoint)
  // Do not turn a subscription registration into a server-side arbitrary URL request.
  const host=u.hostname
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||u.href.length>2048)return false
  if(!(host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com')))return false
  const decode=(v:unknown,length:number)=>typeof v==='string'&&/^[A-Za-z0-9_-]+={0,2}$/.test(v)&&atob(v.replace(/-/g,'+').replace(/_/g,'/')).length===length
  return decode(value.keys?.p256dh,65)&&decode(value.keys?.auth,16)
 }catch{return false}
}
