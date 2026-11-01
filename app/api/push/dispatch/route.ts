import {NextResponse} from 'next/server'
import {cronAuthorized,pushAdmin,dispatchPush} from '@/lib/push-server'
export const runtime='nodejs'
export const maxDuration=120
export const dynamic='force-dynamic'
export async function GET(request:Request){
 if(!cronAuthorized(request))return NextResponse.json({error:'unauthorized'},{status:401})
 try{return NextResponse.json(await dispatchPush(pushAdmin()),{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Push dispatch unavailable'},{status:503})}
}
export const POST=GET
