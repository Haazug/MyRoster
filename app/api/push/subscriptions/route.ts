import {NextResponse} from 'next/server'
import {pushAdmin,pushKeys,pushUser,pushBody} from '@/lib/push-server'
import {pushPreferences,validPushSubscription} from '@/lib/push-model'
import {interfaceLanguages} from '@/lib/interface-i18n'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const response=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}})
const language=(v:unknown)=>interfaceLanguages.includes(v as any)?v:'en'
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v)
export async function GET(request:Request){
 try{
  const db=pushAdmin(),user=await pushUser(request,db);if(!user)return response({error:'unauthorized'},401)
  const {data,error}=await db.from('push_subscriptions').select('id,endpoint,preferences,language,vapid_public_key').eq('user_id',user.id)
  if(error)throw error
  return response({subscriptions:data})
 }catch{return response({error:'unavailable'},503)}
}
export async function POST(request:Request){
 try{
  const db=pushAdmin(),user=await pushUser(request,db);if(!user)return response({error:'unauthorized'},401)
  const {publicKey}=pushKeys(),body=await pushBody(request)
  if(!validPushSubscription(body.subscription))return response({error:'invalid'},400)
  const subscription={endpoint:body.subscription.endpoint,keys:{p256dh:body.subscription.keys.p256dh,auth:body.subscription.keys.auth}}
  const {data:existing,error:readError}=await db.from('push_subscriptions').select('id,user_id').eq('endpoint',subscription.endpoint).maybeSingle()
  if(readError)throw readError
  if(existing&&existing.user_id!==user.id)return response({error:'conflict'},409)
  const {count,error:countError}=await db.from('push_subscriptions').select('id',{count:'exact',head:true}).eq('user_id',user.id)
  if(countError)throw countError
  if(!existing&&(count||0)>=8)return response({error:'deviceLimit'},409)
  const values={user_id:user.id,endpoint:subscription.endpoint,subscription,preferences:pushPreferences(body.preferences),language:language(body.language),vapid_public_key:publicKey,updated_at:new Date().toISOString()}
  const query=existing?db.from('push_subscriptions').update(values).eq('id',existing.id).eq('user_id',user.id):db.from('push_subscriptions').insert(values)
  const {data,error}=await query.select('id').single();if(error)throw error
  return response({id:data.id})
 }catch{return response({error:'unavailable'},503)}
}
export async function PATCH(request:Request){
 try{
  const db=pushAdmin(),user=await pushUser(request,db);if(!user)return response({error:'unauthorized'},401)
  const body=await pushBody(request);if(!uuid(body.id))return response({error:'invalid'},400)
  const {data,error}=await db.from('push_subscriptions').update({preferences:pushPreferences(body.preferences),language:language(body.language),updated_at:new Date().toISOString()}).eq('id',body.id).eq('user_id',user.id).select('id').maybeSingle()
  if(error)throw error
  return data?response({ok:true}):response({error:'missing'},404)
 }catch{return response({error:'unavailable'},503)}
}
export async function DELETE(request:Request){
 try{
  const db=pushAdmin(),user=await pushUser(request,db);if(!user)return response({error:'unauthorized'},401)
  const body=await pushBody(request);if(!uuid(body.id))return response({error:'invalid'},400)
  const {error}=await db.from('push_subscriptions').delete().eq('id',body.id).eq('user_id',user.id)
  if(error)throw error
  return response({ok:true})
 }catch{return response({error:'unavailable'},503)}
}
