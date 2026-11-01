import {distNm,pointsAlong} from './live-geo'
import {isoOf} from './flags'
import type {ResolvedFlight} from './live-model'
type Airport={iata?:string;city?:string;country?:string;lat:number;lon:number}
const americas=new Set('AG AI AR AW BB BL BM BO BQ BR BS BZ CA CL CO CR CU CW DM DO EC FK GD GF GL GP GT GY HN HT JM KN KY LC MF MQ MS MX NI PA PE PM PR PY SR SV SX TC TT US UY VC VE VG VI'.split(' '))
export function isTransatlantic(a?:Airport,b?:Airport){
 if(!a||!b||distNm(a,b)<=350)return false
 const c=isoOf(a.country||'')||a.country||'',d=isoOf(b.country||'')||b.country||''
 // An Americas–other-region route must actually pass through the Atlantic corridor.
 // This includes onward destinations in Asia while rejecting Pacific and polar routes.
 if(americas.has(c)===americas.has(d))return false
 return pointsAlong(a,b,350,32).some(p=>p.lon>-60&&p.lon<-15&&p.lat>-55&&p.lat<67)
}
const regions:Record<string,Set<string>>={
 NA:new Set('AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI'.split(' ')),
 SA:new Set('AR BO BR CL CO EC FK GF GY PE PY SR UY VE'.split(' ')),
 EU:new Set('AD AL AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK'.split(' ')),
 AF:new Set('AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW'.split(' ')),
 AS:new Set('AE AF AM AZ BD BH BN BT CN CY GE HK ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE'.split(' ')),
 OC:new Set('AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV VU WF WS'.split(' '))
}
function continent(a:Airport){const code=isoOf(a.country||'')||a.country||'';return Object.keys(regions).find(key=>regions[key].has(code))}
// Transcontinental here means endpoints on different continents; unknown endpoints remain unclassified.
export function isTranscontinental(a?:Airport,b?:Airport){if(!a||!b)return false;const x=continent(a),y=continent(b);return !!x&&!!y&&x!==y}
const speeds:Record<string,number>={BE33:165,BE36:165,C172:110,C182:140,C208:170,SR22:180,AT76:270,AT72:260,AT75:275,AT45:250,DH8D:330,DH8C:280,PC12:270,B350:290,TBM9:300}
export function estimatedArrival(f:Pick<ResolvedFlight,'observedAt'|'lat'|'lon'|'gs'|'type'|'arrivesAt'>,to?:Airport){
 if(f.arrivesAt&&Number.isFinite(f.arrivesAt))return {eta:f.arrivesAt,etaSource:'schedule' as const}
 if(!to||!Number.isFinite(f.lat)||!Number.isFinite(f.lon)||!Number.isFinite(f.observedAt))return {}
 const baseline=speeds[f.type||'']||450,distance=distNm(f,to)
 const measured=!!f.gs&&f.gs>=40&&f.gs<=800&&(distance<500||f.gs>=baseline*.6)
 const speed=measured?f.gs!:baseline
 return {eta:Math.round(f.observedAt+(distNm(f,to)/speed*60+10)*60_000),etaSource:measured?'position' as const:'route' as const}
}
export function enrichLiveEstimate(f:ResolvedFlight,airports:Map<string,Airport>){
 const from=airports.get(f.from||''),to=airports.get(f.to||'')
 let nearest:Airport|undefined,distance=120
 for(const point of airports.values()){
  if(Math.abs(point.lat-f.lat)>2.5)continue
  const d=distNm(f,point);if(d<distance){nearest=point;distance=d}
 }
 const eta=f.source==='timetable'&&!f.arrivesAt?(from&&to&&f.departedAt?{eta:Math.round(f.departedAt+(distNm(from,to)/(speeds[f.type||'']||450)*60+20)*60000),etaSource:'route' as const}:{}):estimatedArrival(f,to)
 return {...f,...eta,transatlantic:isTransatlantic(from,to),transcontinental:isTranscontinental(from,to),lastSeenPlace:nearest?`${nearest.city||nearest.iata} (${nearest.iata})`:`${f.lat.toFixed(2)}°, ${f.lon.toFixed(2)}°`}
}
