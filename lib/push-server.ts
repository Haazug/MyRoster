import {createClient} from '@supabase/supabase-js'
import webPush from 'web-push'
import {timingSafeEqual} from 'node:crypto'
import {interfaceText,interfaceLanguages} from './interface-i18n'
import {pushPreferences,pushStage,scheduleTag,type PushStage} from './push-model'

export function pushAdmin(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY
 if(!url||!key)throw Error('Push not configured')
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
}
export function pushKeys(){
 const publicKey=process.env.WEB_PUSH_VAPID_PUBLIC_KEY,privateKey=process.env.WEB_PUSH_VAPID_PRIVATE_KEY,subject=process.env.WEB_PUSH_VAPID_SUBJECT
 if(!publicKey||!privateKey||!subject)throw Error('Push not configured')
 webPush.setVapidDetails(subject,publicKey,privateKey)
 return {publicKey}
}
export function cronAuthorized(request:Request){
 const secret=process.env.PUSH_CRON_SECRET,given=request.headers.get('authorization')||'',expected=`Bearer ${secret||''}`
 return !!secret&&Buffer.byteLength(given)===Buffer.byteLength(expected)&&timingSafeEqual(Buffer.from(given),Buffer.from(expected))
}
export async function pushUser(request:Request,db:ReturnType<typeof pushAdmin>){
 const match=/^Bearer (\S+)$/.exec(request.headers.get('authorization')||'')
 if(!match)return null
 const {data,error}=await db.auth.getUser(match[1]);return error?null:data.user
}
export async function pushBody(request:Request){
 if(Number(request.headers.get('content-length'))>8192)throw Error('Invalid body')
 const reader=request.body?.getReader();if(!reader)throw Error('Missing body')
 const chunks:Uint8Array[]=[];let size=0
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw Error('Too large')}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 return JSON.parse(new TextDecoder().decode(bytes))
}
export function pushText(language:string,key:string){const i=interfaceLanguages.indexOf(language as any);return interfaceText[key]?.[i<0?0:i]||key}
export type PushRow={id:string;user_id:string;subscription:webPush.PushSubscription;preferences:unknown;language:string;vapid_public_key:string}
export async function deliverPush(db:ReturnType<typeof pushAdmin>,sub:PushRow,booking:any,stage:PushStage|'test',now=Date.now()){
 const scheduledAt=stage==='test'?Math.floor(now/60000)*60000:booking.scheduledAt
 const bookingId=stage==='test'?'test':booking.id
 const {data:lease,error}=await db.rpc('claim_push_delivery',{sub_id:sub.id,trip_id:bookingId,departure_at:scheduledAt,event_stage:stage})
 if(error)throw Error('Push claim failed')
 if(!lease)return 'skipped'
 const tag=stage==='test'?`myroster.push.test.${sub.id}`:scheduleTag(sub.user_id,bookingId,scheduledAt,stage)
 const title=pushText(sub.language,stage==='test'?'push.testTitle':`schedule.${stage}`)
 const body=stage==='test'?pushText(sub.language,'push.testBody'):`${String(booking.flightNumber||'').slice(0,20)} ${String(booking.orig||'').slice(0,8)} → ${String(booking.dest||'').slice(0,8)}`
 const payload={title,body,tag,userId:sub.user_id,subscriptionId:sub.id,url:stage==='test'?'/profile#notifications':'/trips',expiresAt:now+5*60000}
 try{
  await webPush.sendNotification(sub.subscription,JSON.stringify(payload),{TTL:300,urgency:'high',timeout:8000})
 }catch(error:any){
  if(error.statusCode===404||error.statusCode===410){const {error:deleted}=await db.from('push_subscriptions').delete().eq('id',sub.id);if(deleted)throw Error('Push cleanup failed');return 'expired'}
  const {error:failed}=await db.from('push_deliveries').update({next_attempt_at:new Date(now+2*60000).toISOString()}).eq('subscription_id',sub.id).eq('booking_id',bookingId).eq('scheduled_at',scheduledAt).eq('stage',stage).eq('lease',lease)
  if(failed)throw Error('Push retry failed')
  return 'failed'
 }
 const {error:marked}=await db.from('push_deliveries').update({sent_at:new Date(now).toISOString()}).eq('subscription_id',sub.id).eq('booking_id',bookingId).eq('scheduled_at',scheduledAt).eq('stage',stage).eq('lease',lease)
 if(marked)throw Error('Push receipt failed')
 return 'sent'
}
export async function dispatchPush(db:ReturnType<typeof pushAdmin>,now=Date.now()){
 const {publicKey}=pushKeys()
 const {data:subscriptions,error}=await db.from('push_subscriptions').select('*').eq('vapid_public_key',publicKey).order('last_checked_at').limit(40)
 if(error)throw Error('Push subscriptions unavailable')
 const counts={checked:0,sent:0,failed:0,expired:0,skipped:0};let cursor=0
 const deadline=Date.now()+40000
 const work=async()=>{for(;;){if(Date.now()>deadline)return;const sub=subscriptions?.[cursor++] as PushRow|undefined;if(!sub)return
  const {data,error}=await db.from('user_data').select('value').eq('user_id',sub.user_id).eq('key','myroster.bookings').maybeSingle()
  if(error)throw Error('Bookings unavailable')
  const bookings=Array.isArray(data?.value)?data.value:[],preferences=pushPreferences(sub.preferences)
  // The database validates again at claim time, including takeoff, rescheduling and preference changes.
  for(const booking of bookings){if(Date.now()>deadline)return;if(!booking||typeof booking.id!=='string')continue;const stage=pushStage(booking,now);if(!stage||!preferences[stage])continue;const result=await deliverPush(db,sub,booking,stage,now);counts[result]++;if(result==='expired')break}
  const {error:updated}=await db.from('push_subscriptions').update({last_checked_at:new Date(now).toISOString()}).eq('id',sub.id);if(updated)throw Error('Push cursor failed');counts.checked++
 }}
 await Promise.all(Array.from({length:4},()=>work()))
 const {error:heartbeat}=await db.from('push_dispatch_state').update({last_success_at:new Date(now).toISOString()}).eq('id',1)
 if(heartbeat)throw Error('Push heartbeat failed')
 const {error:cleanup}=await db.from('push_deliveries').delete().lt('leased_at',new Date(now-7*86400000).toISOString());if(cleanup)throw Error('Push maintenance failed')
 return counts
}
