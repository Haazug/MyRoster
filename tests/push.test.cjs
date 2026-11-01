const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm')
function loader(adapters={}){const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{if(name in adapters)return adapters[name];if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return require(name)},m,m.exports);return m.exports}return load}
const model=loader()('lib/push-model.ts')
test('push chooses only the current reminder, follows preflight and automatic cancellation rules and bounds stale catch-up',()=>{
 const at=10000000,f={scheduledAt:at,takeoffAt:null}
 for(const [offset,stage]of [[-3600001,null],[-3600000,'checkin'],[-1800000,'doors'],[0,'due'],[1500000,'disembark'],[10800000,'cancelled'],[86400001,null]])assert.equal(model.pushStage(f,at+offset),stage)
 assert.equal(model.pushStage({...f,takeoffAt:at+1},at+10800000),null)
 assert.equal(model.pushStage({...f,status:'cancelled'},at+10800000),null)
 assert.equal(model.pushStage({...f,status:'cancelled',cancellationReason:'missed-departure'},at+10800000),'cancelled')
 assert.equal(model.pushStage({...f,status:'completed'},at+10800000),null)
 assert.equal(model.pushPreferences({due:false,doors:'false'}).due,false);assert.equal(model.pushPreferences({doors:'false'}).doors,true)
})
test('subscription endpoints reject arbitrary URLs, credentials and malformed encryption keys',()=>{
 const sub={endpoint:'https://web.push.apple.com/Qtest',keys:{p256dh:Buffer.alloc(65,4).toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}}
 assert.equal(model.validPushSubscription(sub),true)
 for(const endpoint of ['http://web.push.apple.com/x','https://localhost/x','https://web.push.apple.com.evil.test/x','https://user@web.push.apple.com/x','https://web.push.apple.com:444/x','https://127.0.0.1/x'])assert.equal(model.validPushSubscription({...sub,endpoint}),false)
 assert.equal(model.validPushSubscription({...sub,keys:{...sub.keys,auth:'bad'}}),false)
})
const response={NextResponse:{json:(body,options)=>({body,status:options?.status||200})}}
test('dispatch requires the exact secret and rejects absent secrets',()=>{
 const old=process.env.PUSH_CRON_SECRET
 try{
  const {cronAuthorized}=loader({'web-push':{default:{}}})('lib/push-server.ts')
  delete process.env.PUSH_CRON_SECRET;assert.equal(cronAuthorized(new Request('http://test')),false)
  process.env.PUSH_CRON_SECRET='test-secret';assert.equal(cronAuthorized(new Request('http://test',{headers:{Authorization:'Bearer test-secret'}})),true)
  assert.equal(cronAuthorized(new Request('http://test',{headers:{Authorization:'Bearer test-secrex'}})),false)
 }finally{if(old===undefined)delete process.env.PUSH_CRON_SECRET;else process.env.PUSH_CRON_SECRET=old}
})
test('subscription mutation does not inspect a body or touch another account when authentication fails',async()=>{
 let parsed=false
 const api=loader({'next/server':response,'@/lib/push-server':{pushAdmin:()=>({}),pushUser:async()=>null,pushBody:async()=>{parsed=true;return {}},pushKeys:()=>({})}})('app/api/push/subscriptions/route.ts')
 for(const method of ['GET','POST','PATCH','DELETE'])assert.equal((await api[method](new Request('http://test'))).status,401)
 assert.equal(parsed,false)
})
test('a provider-expired subscription is deleted; transient errors are retried without recording success',async()=>{
 for(const statusCode of [410,503]){
  const operations=[]
  const db={rpc:async()=>({data:'lease-1'}),from:table=>{const chain={delete:()=>{operations.push([table,'delete']);return chain},update:patch=>{operations.push([table,'update',patch]);return chain},eq:()=>chain,then:resolve=>resolve({error:null})};return chain}}
  const {deliverPush}=loader({'web-push':{default:{sendNotification:async()=>{throw {statusCode}}}}})('lib/push-server.ts')
  const result=await deliverPush(db,{id:'sub',user_id:'user',language:'pt',subscription:{}},{id:'flight',scheduledAt:1000,orig:'LIS',dest:'JFK'},'due',2000)
  assert.equal(result,statusCode===410?'expired':'failed')
  assert.equal(operations.some(o=>o[2]?.sent_at),false)
  assert.equal(operations[0][0],statusCode===410?'push_subscriptions':'push_deliveries')
 }
})
test('successful push uses localized content, the same schedule tag as the page, an expiry and a guarded receipt',async()=>{
 let payload,options,patch;const filters=[]
 const db={rpc:async()=>({data:'lease-1'}),from:()=>{const c={update:p=>{patch=p;return c},eq:(k,v)=>{filters.push([k,v]);return c},then:r=>r({error:null})};return c}}
 const {deliverPush}=loader({'web-push':{default:{sendNotification:async(s,p,o)=>{payload=JSON.parse(p);options=o}}}})('lib/push-server.ts')
 assert.equal(await deliverPush(db,{id:'sub',user_id:'user',language:'pt',subscription:{}},{id:'flight',scheduledAt:1000,flightNumber:'TP209',orig:'LIS',dest:'JFK'},'due',2000),'sent')
 assert.equal(payload.title,'Está na hora de iniciar o voo');assert.equal(payload.tag,model.scheduleTag('user','flight',1000,'due'));assert.equal(payload.url,'/trips');assert.equal(payload.userId,'user');assert(payload.expiresAt>2000);assert.equal(options.TTL,300);assert(patch.sent_at);assert(filters.some(([k,v])=>k==='lease'&&v==='lease-1'))
})
function workerHarness(owner){
 const handlers={},shown=[],navigated=[],state={owner}
 const indexedDB={open:()=>{const request={};setTimeout(()=>{request.result={transaction:()=>{const tx={},store={get:()=>{const r={result:state.owner};setTimeout(()=>tx.oncomplete?.(),0);return r},put:value=>{state.owner=value;const r={};setTimeout(()=>tx.oncomplete?.(),0);return r},delete:()=>{state.owner=null;const r={};setTimeout(()=>tx.oncomplete?.(),0);return r}};tx.objectStore=()=>store;return tx},close:()=>{}};request.onsuccess()},0);return request}}
 const self={location:{origin:'https://myroster.test'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async url=>navigated.push(url)}}
 vm.runInNewContext(fs.readFileSync('public/push-sw.js','utf8'),{self,indexedDB,URL,Date,Promise,setTimeout})
 async function push(payload){let pending;handlers.push({data:{json:()=>payload},waitUntil:p=>pending=p});await pending}
 return {handlers,shown,navigated,push,state}
}
test('service worker receives with no open page, rejects stale/other-account payloads, and opens only an internal URL',async()=>{
 const worker=workerHarness({userId:'user',subscriptionId:'sub'}),payload={title:'Test',body:'Reminder',userId:'user',subscriptionId:'sub',expiresAt:Date.now()+60000,url:'https://evil.test'}
 await worker.push({...payload,userId:'other'});await worker.push({...payload,expiresAt:1});assert.equal(worker.shown.length,0)
 await worker.push(payload);assert.equal(worker.shown.length,1);assert.equal(worker.shown[0][1].data.url,'/profile#notifications')
 let pending;worker.handlers.notificationclick({notification:{close:()=>{},data:{url:'https://evil.test'}},waitUntil:p=>pending=p});await pending;assert.equal(worker.navigated[0],'https://myroster.test/profile#notifications')
 worker.state.owner=null;await worker.push(payload);assert.equal(worker.shown.length,1)
 assert.equal(worker.handlers.fetch,undefined,'push worker must not alter normal site requests')
})
test('the actual Web Push library creates an encrypted request with VAPID authentication without contacting a provider',()=>{
 const webPush=require('web-push'),crypto=require('node:crypto'),vapid=webPush.generateVAPIDKeys(),ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys()
 const subscription={endpoint:'https://web.push.apple.com/test',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}}
 const request=webPush.generateRequestDetails(subscription,JSON.stringify({title:'Test'}),{vapidDetails:{subject:'mailto:test@example.invalid',publicKey:vapid.publicKey,privateKey:vapid.privateKey}})
 assert(Buffer.isBuffer(request.body));assert(request.body.length>100);assert.equal(request.headers['Content-Encoding'],'aes128gcm');assert(request.headers.Authorization.startsWith('vapid '))
})
