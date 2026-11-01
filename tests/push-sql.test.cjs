const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {PGlite}=require('@electric-sql/pglite')
const db=new PGlite(),user='00000000-0000-0000-0000-000000000001',sub='00000000-0000-0000-0000-000000000002'
const migration=fs.readFileSync('supabase/migrations/202611010001_push_notifications.sql','utf8')
test.before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key);
 create table public.user_data(user_id uuid,key text,value jsonb,primary key(user_id,key));`)
 await db.exec(migration);await db.exec(migration)
 await db.query('insert into auth.users(id) values($1)',[user])
 await db.query(`insert into public.push_subscriptions(id,user_id,endpoint,subscription,vapid_public_key) values($1,$2,'https://web.push.apple.com/test','{}','public-key')`,[sub,user])
})
test.after(()=>db.close())
async function booking(patch={}){
 const {rows}=await db.query('select (extract(epoch from now())*1000)::bigint as now')
 const f={id:'flight',scheduledAt:Number(rows[0].now)-10000,takeoffAt:null,status:'scheduled',...patch}
 await db.query(`insert into public.user_data values($1,'myroster.bookings',$2) on conflict(user_id,key) do update set value=excluded.value`,[user,JSON.stringify([f])]);return f
}
async function claim(f,stage='due'){return (await db.query('select public.claim_push_delivery($1,$2,$3,$4) as lease',[sub,f.id,f.scheduledAt,stage])).rows[0].lease}
test('real PostgreSQL migration is repeatable and leases deduplicate concurrent and completed deliveries',async()=>{
 const f=await booking(),first=await claim(f);assert(first)
 assert.equal(await claim(f),null)
 await db.query('update public.push_deliveries set sent_at=now(),leased_at=now()-interval \'5 minutes\' where lease=$1',[first])
 assert.equal(await claim(f),null)
})
test('database rejects stale schedule, actual takeoff, manual cancellation, disabled preference and wrong reminder stage',async()=>{
 const f=await booking({id:'guards'})
 assert.equal(await claim({...f,scheduledAt:f.scheduledAt-1000}),null)
 await booking({...f,takeoffAt:f.scheduledAt+1000});assert.equal(await claim(f),null)
 await booking({...f,status:'cancelled'});assert.equal(await claim(f),null)
 await booking(f);assert.equal(await claim(f,'checkin'),null)
 await db.query(`update public.push_subscriptions set preferences='{"due":false}' where id=$1`,[sub]);assert.equal(await claim(f),null)
 await db.query(`update public.push_subscriptions set preferences='{}' where id=$1`,[sub]);assert(await claim(f))
})
test('preflight startedAt does not suppress a cancellation after 3 hours; automatic cancellations remain eligible',async()=>{
 const time=(await db.query('select (extract(epoch from now())*1000)::bigint as now')).rows[0].now
 const f=await booking({id:'cancel',scheduledAt:Number(time)-4*3600000,startedAt:Number(time)-5*3600000,takeoffAt:null,status:'cancelled',cancellationReason:'missed-departure'})
 assert(await claim(f,'cancelled'))
 await booking({...f,id:'manual',cancellationReason:undefined});assert.equal(await claim({...f,id:'manual'},'cancelled'),null)
})
test('expired leases can retry but old attempts cannot masquerade as the new lease',async()=>{
 const f=await booking({id:'retry'}),first=await claim(f);assert(first)
 await db.query(`update public.push_deliveries set leased_at=now()-interval '3 minutes' where lease=$1`,[first])
 const second=await claim(f);assert(second);assert.notEqual(first,second)
 assert.equal((await db.query('update public.push_deliveries set sent_at=now() where lease=$1 returning id',[first])).rows.length,0)
 await db.query('update public.push_deliveries set attempts=5,leased_at=now()-interval \'3 minutes\' where lease=$1',[second]);assert.equal(await claim(f),null)
})
test('anon/authenticated users cannot read subscriptions or execute the service-only claim function',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role)
  try{await assert.rejects(db.query('select * from public.push_subscriptions'),e=>e.code==='42501');await assert.rejects(db.query('select public.claim_push_delivery($1,$2,$3,$4)',[sub,'test',1000,'test']),e=>e.code==='42501')}finally{await db.exec('reset role')}
 }
})
test('scheduler SQL requires Vault entries and schedules exactly one minute job when reapplied',async()=>{
 await db.exec(`create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
 create schema cron; create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text,active boolean default true);
 create function cron.unschedule(bigint) returns boolean language sql as 'with d as(delete from cron.job where jobid=$1 returning *) select exists(select 1 from d)';
 create function cron.schedule(text,text,text) returns bigint language sql as 'insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid';`)
 const sql=fs.readFileSync('supabase/push-scheduler.sql','utf8').replace(/^create extension .*;\n/gm,'')
 await assert.rejects(db.exec(sql),/Create myroster_push_url and myroster_push_token/)
 await db.exec(`insert into vault.decrypted_secrets values('myroster_push_url','https://myroster.test/api/push/dispatch'),('myroster_push_token','test-token')`)
 await db.exec(sql);await db.exec(sql)
 const {rows}=await db.query('select * from cron.job');assert.equal(rows.length,1);assert.equal(rows[0].schedule,'* * * * *');assert(rows[0].command.includes('net.http_post'));assert(!rows[0].command.includes('test-token'))
})
