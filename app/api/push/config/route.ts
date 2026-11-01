import {NextResponse} from 'next/server'
import {pushAdmin,pushKeys} from '@/lib/push-server'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(){
 const headers={'Cache-Control':'no-store'}
 try{
  const {publicKey}=pushKeys();if(!process.env.PUSH_CRON_SECRET)throw Error('Missing scheduler secret')
  const db=pushAdmin()
  const [subscriptions,state]=await Promise.all([
   db.from('push_subscriptions').select('id').limit(0),
   db.from('push_dispatch_state').select('last_success_at').eq('id',1).maybeSingle(),
  ])
  if(subscriptions.error||state.error||!state.data)throw Error('Migration missing')
  const lastRun=state.data.last_success_at as string|null
  return NextResponse.json({configured:true,publicKey,schedulerReady:!!lastRun&&Date.now()-Date.parse(lastRun)<5*60000,lastRun},{headers})
 }catch{return NextResponse.json({configured:false,schedulerReady:false},{headers})}
}
