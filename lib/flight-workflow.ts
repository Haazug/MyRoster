export type TripState = 'booked' | 'scheduled' | 'delayed' | 'running' | 'completed' | 'cancelled'
export function departureChoice(time: string, now = Date.now()) {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error('Invalid departure time')
  const date = new Date(now)
  const differs = date.getHours() !== Number(match[1]) || date.getMinutes() !== Number(match[2])
  date.setHours(Number(match[1]),Number(match[2]),0,0)
  if (differs && date.getTime() <= now) date.setDate(date.getDate()+1)
  return { differs, scheduledAt: date.getTime() }
}
export type ScheduledTrip={scheduledAt?:number;startedAt?:number;takeoffAt?:number|null;endedAt?:number;status?:string}
export const CANCELLATION_DELAY=3*3600_000
export function hasDeparted(f:ScheduledTrip){return !!f.takeoffAt||(f.takeoffAt===undefined&&!!f.startedAt&&f.status!=='scheduled'&&f.status!=='delayed')}
export function tripState(f:ScheduledTrip,now=Date.now()):TripState{
 if(f.status==='cancelled')return 'cancelled'
 if(f.endedAt||f.status==='completed')return 'completed'
 if(hasDeparted(f))return 'running'
 if(f.scheduledAt){if(now>=f.scheduledAt+CANCELLATION_DELAY)return 'cancelled';return now>=f.scheduledAt?'delayed':'scheduled'}
 return 'booked'
}
export function scheduledEvent(f:ScheduledTrip,now=Date.now()){
 if(!f.scheduledAt||f.endedAt||f.status==='completed'||f.status==='cancelled'||hasDeparted(f))return null
 const delta=now-f.scheduledAt
 const stages=[['checkin',-3600_000],['doors',-1800_000],['due',0],['disembark',25*60_000],['cancelled',CANCELLATION_DELAY]] as const
 return [...stages].reverse().find(([,at])=>delta>=at)?.[0]||null
}
export function progressFraction(elapsed: number,total: number) {
 return Number.isFinite(elapsed)&&Number.isFinite(total)&&total>0?Math.max(0,Math.min(1,elapsed/total)):0
}
export type RoutePoint={lat:number;lon:number}
const radians=(d:number)=>d*Math.PI/180
function angle(a:RoutePoint,b:RoutePoint){const x=Math.sin(radians(b.lat-a.lat)/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(radians(b.lon-a.lon)/2)**2;return 2*Math.asin(Math.min(1,Math.sqrt(x)))}
export function interpolateRoute(a:RoutePoint,b:RoutePoint,t:number):RoutePoint {
 const d=angle(a,b)
 if(d<1e-8)return {...a}
 if(Math.abs(Math.sin(d))<1e-8)return {lat:a.lat+(b.lat-a.lat)*t,lon:((a.lon+(((b.lon-a.lon+540)%360)-180)*t+540)%360)-180}
 const A=Math.sin((1-t)*d)/Math.sin(d),B=Math.sin(t*d)/Math.sin(d)
 const x=A*Math.cos(radians(a.lat))*Math.cos(radians(a.lon))+B*Math.cos(radians(b.lat))*Math.cos(radians(b.lon))
 const y=A*Math.cos(radians(a.lat))*Math.sin(radians(a.lon))+B*Math.cos(radians(b.lat))*Math.sin(radians(b.lon))
 const z=A*Math.sin(radians(a.lat))+B*Math.sin(radians(b.lat))
 return {lat:Math.atan2(z,Math.sqrt(x*x+y*y))*180/Math.PI,lon:Math.atan2(y,x)*180/Math.PI}
}
export function splitRoute(points:RoutePoint[],fraction:number) {
 const p=Math.max(0,Math.min(1,fraction)),lengths=points.slice(1).map((b,i)=>angle(points[i],b)),total=lengths.reduce((a,b)=>a+b,0)
 if(points.length<2||!total)return {done:[] as RoutePoint[],remaining:points}
 const target=total*p;let covered=0
 for(let i=0;i<lengths.length;i++){
  if(covered+lengths[i]>=target||i===lengths.length-1){
   const at=interpolateRoute(points[i],points[i+1],lengths[i]?(target-covered)/lengths[i]:0)
   return {done:p>0?[...points.slice(0,i+1),at]:[],remaining:p<1?[at,...points.slice(i+1)]:[]}
  }
  covered+=lengths[i]
 }
 return {done:points,remaining:[] as RoutePoint[]}
}
export function calendarEvent(id:string,title:string,at:number,duration:number,url:string) {
 const text=(v:string)=>v.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,m=>'\\'+m)
 const date=(n:number)=>new Date(n).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//MyRoster//Flight reminder//EN','BEGIN:VEVENT',`UID:${text(id)}@myroster`,`DTSTAMP:${date(Date.now())}`,`DTSTART:${date(at)}`,`DTEND:${date(at+duration*60000)}`,`SUMMARY:${text(title)}`,`URL:${url}`,'BEGIN:VALARM','TRIGGER:PT0M','ACTION:DISPLAY',`DESCRIPTION:${text(title)}`,'END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n')+'\r\n'
}

// Keep the booking identity and route, but reset the lifecycle and its notification generation.
export function rescheduleTrip<T extends ScheduledTrip & {plan?:any;departure?:string}>(flight:T,at:number,now=Date.now()):T {
 if(!Number.isFinite(at)||at<=now||hasDeparted(flight)||flight.endedAt||flight.status==='completed')throw new Error('Invalid reschedule')
 return {...flight,scheduledAt:at,departure:new Date(at).toISOString(),status:'scheduled',startedAt:undefined,takeoffAt:null,endedAt:undefined,plan:flight.plan?{...flight.plan,scheduledAt:at}:undefined}
}
