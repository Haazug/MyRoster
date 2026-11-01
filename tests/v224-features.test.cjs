const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
function loader(adapters={}){const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{if(name in adapters)return adapters[name];if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return require(name)},m,m.exports);return m.exports}return load}
const load=loader(),{tripState,scheduledEvent,rescheduleTrip,CANCELLATION_DELAY}=load('lib/flight-workflow.ts')
test('scheduled preflight never counts as takeoff, including legacy startedAt and exact 3-hour boundary',()=>{
 const at=1000,f={scheduledAt:at,startedAt:1100,status:'scheduled'}
 assert.equal(tripState(f,at-1),'scheduled');assert.equal(tripState(f,at),'delayed')
 assert.equal(tripState(f,at+CANCELLATION_DELAY-1),'delayed')
 assert.equal(tripState(f,at+CANCELLATION_DELAY),'cancelled')
 assert.equal(scheduledEvent(f,at+CANCELLATION_DELAY),'cancelled')
 assert.equal(tripState({...f,takeoffAt:1200},at+CANCELLATION_DELAY),'running')
 assert.equal(scheduledEvent({...f,takeoffAt:1200},at+CANCELLATION_DELAY),null)
})
test('reschedule a cancelled flight without losing identity or route and reset lifecycle and reminder generation',()=>{
 const f={id:'one',orig:'LPPT',dest:'KJFK',scheduledAt:1000,startedAt:1200,takeoffAt:null,status:'cancelled',plan:{scheduledAt:1000,aircraft:'A330',waypoints:[1,2]}}
 const next=rescheduleTrip(f,900000,800000)
 assert.equal(f.status,'cancelled');assert.equal(next.id,f.id);assert.equal(next.orig,f.orig)
 assert.equal(next.startedAt,undefined);assert.equal(next.takeoffAt,null);assert.equal(next.status,'scheduled')
 assert.equal(next.plan.scheduledAt,900000);assert.deepEqual(next.plan.waypoints,[1,2]);assert.equal(next.departure,new Date(900000).toISOString())
 assert.equal(tripState(next,800000),'scheduled');assert.equal(scheduledEvent(next,900000),'due')
 assert.throws(()=>rescheduleTrip(f,NaN,800000));assert.throws(()=>rescheduleTrip(f,700000,800000))
 assert.throws(()=>rescheduleTrip({...f,takeoffAt:100},900000,800000))
 assert.throws(()=>rescheduleTrip({...f,status:'completed'},900000,800000))
})
const {parseRouteData,msfsShareUrl,csvRows}=load('lib/route-import.ts')
test('Volanta JSON/CSV multi-route imports preserve flight identity and validate all routes before preview',()=>{
 const plans=parseRouteData(JSON.stringify({flights:[{departure:{icao:'lppt'},arrival:{icao:'KJFK'},aircraft:{icao:'A339'},flightNumber:'TP209',waypoints:[{id:'LPPT',lat:38.77,lon:-9.13}]}]}))
 assert.equal(plans[0].departure,'LPPT');assert.equal(plans[0].arrival,'KJFK');assert.equal(plans[0].aircraft,'A339');assert.equal(plans[0].flightNumber,'TP209');assert.equal(plans[0].waypoints[0].latitude,38.77)
 const csv='Departure ICAO,Arrival ICAO,Flight Number,Notes\r\nLPPT,KJFK,TP209,"with, comma"\r\nKJFK,LPPT,TP210,"two ""quotes"""'
 assert.equal(parseRouteData(csv).length,2);assert.equal(parseRouteData(csv)[1].flightNumber,'TP210')
 assert.equal(csvRows('a,b\n"line\nbreak",value')[1][0],'line\nbreak')
 assert.throws(()=>parseRouteData('[{"departure":"LPPT","arrival":"KJFK","waypoints":[{"lat":91,"lon":1}]}]'))
 assert.throws(()=>parseRouteData('[{"departure":"LPPT","arrival":"LPPT"}]'))
 assert.throws(()=>parseRouteData('departure,arrival\nLPPT,KJFK\nBAD!,KJFK'))
 assert.throws(()=>parseRouteData('x'.repeat(2000001)))
})
test('MSFS share URLs reject alternate hosts, credentials, ports and paths',()=>{
 const url='https://planner.flightsimulator.com/share/0cc9ddc2-5e7f-4d90-b827-84c8dc8a68a6'
 assert.equal(msfsShareUrl(url+'?tracking=1'),url)
 for(const bad of ['http://planner.flightsimulator.com/share/id','https://evil.test/share/id',url.replace('https://','https://name@'),url.replace('.com/','.com:444/'),url.replace('/share/','/api/')])assert.throws(()=>msfsShareUrl(bad))
})
const {isTranscontinental,isTransatlantic,enrichLiveEstimate}=load('lib/live-estimates.ts')
test('route classifications use both endpoints and keep unknown routes unclassified',()=>{
 const lis={country:'Portugal',lat:38.77,lon:-9.13},jfk={country:'United States',lat:40.64,lon:-73.78},fra={country:'Germany',lat:50.03,lon:8.57},nrt={country:'Japan',lat:35.77,lon:140.39}
 assert(isTranscontinental(lis,jfk));assert(isTransatlantic(lis,jfk));assert(!isTranscontinental(lis,fra));assert(isTranscontinental(jfk,nrt));assert(!isTransatlantic(jfk,nrt));assert(!isTranscontinental(lis,undefined));assert(!isTranscontinental(lis,{...jfk,country:'Unknown'}))
 const f=enrichLiveEstimate({from:'LIS',to:'JFK',lat:38,lon:-10,observedAt:1000},new Map([['LIS',lis],['JFK',jfk]]))
 assert.equal(f.transcontinental,true);assert.equal(f.transatlantic,true)
})
test('MSFS authentication redirects are reported without following or forwarding cookies',async()=>{
 const original=global.fetch;let calls=0
 global.fetch=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');assert.equal(options.headers.Cookie,undefined);return new Response(null,{status:302,headers:{Location:'/login'}})}
 try{
  const {POST}=loader({'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}}})('app/api/flight-plan/import/route.ts')
  const result=await POST(new Request('https://myroster.test/api/flight-plan/import',{method:'POST',body:JSON.stringify({url:'https://planner.flightsimulator.com/share/0cc9ddc2-5e7f-4d90-b827-84c8dc8a68a6'})}))
  assert.equal(result.status,422);assert.equal(result.body.error,'authentication');assert.equal(calls,1)
 }finally{global.fetch=original}
})
test('old preflight is invalidated by rescheduling but a matching departure remains resumable',()=>{
 const {flightHasEnded}=loader({'@/lib/supabase':{supabase:{}}})('lib/active-flight.ts')
 const active={plan:{scheduleId:'booking',scheduledAt:1000},statuses:{}}
 assert.equal(flightHasEnded(active,[],[{id:'booking',scheduledAt:2000,status:'scheduled'}]),true)
 assert.equal(flightHasEnded(active,[],[{id:'booking',scheduledAt:1000,status:'scheduled'}]),false)
})
test('stale cancellation cannot overwrite a rescheduled or already airborne booking',async()=>{
 const original={localStorage:global.localStorage,window:global.window,CustomEvent:global.CustomEvent}
 let rows=[{id:'moved',scheduledAt:2000,status:'scheduled',takeoffAt:null},{id:'flying',scheduledAt:1000,status:'running',takeoffAt:1100},{id:'missed',scheduledAt:1000,status:'scheduled',takeoffAt:null}]
 global.localStorage={getItem:()=>JSON.stringify(rows),setItem:(k,v)=>{rows=JSON.parse(v)}};global.window={dispatchEvent:()=>{}};global.CustomEvent=class{}
 try{
  const {updateTripStatus}=loader({'@/lib/supabase':{supabase:{auth:{getSession:async()=>({data:{session:null}})}}}})('lib/trip-client.ts')
  await updateTripStatus('moved',{status:'cancelled'},1000);await updateTripStatus('flying',{status:'cancelled'},1000);await updateTripStatus('missed',{status:'cancelled'},1000)
  assert.equal(rows[0].status,'scheduled');assert.equal(rows[1].status,'running');assert.equal(rows[2].status,'cancelled')
 }finally{for(const [key,value]of Object.entries(original)){if(value===undefined)delete global[key];else global[key]=value}}
})
