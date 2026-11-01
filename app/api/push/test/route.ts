import {NextResponse} from 'next/server'
import {pushAdmin,pushKeys,pushUser,pushBody,deliverPush,type PushRow} from '@/lib/push-server'
export const runtime='nodejs'
export async function POST(request:Request){
 try{
  const db=pushAdmin(),user=await pushUser(request,db)
  if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  const body=await pushBody(request)
  if(typeof body.id!=='string'||body.id.length>40)return NextResponse.json({error:'invalid'},{status:400})
  const {publicKey}=pushKeys()
  const {data,error}=await db.from('push_subscriptions').select('*').eq('id',body.id).eq('user_id',user.id).eq('vapid_public_key',publicKey).maybeSingle()
  if(error)throw error
  if(!data)return NextResponse.json({error:'missing'},{status:404})
  const result=await deliverPush(db,data as PushRow,{},'test')
  return NextResponse.json({result},{status:result==='sent'?200:result==='skipped'?429:502})
 }catch{return NextResponse.json({error:'unavailable'},{status:503})}
}
