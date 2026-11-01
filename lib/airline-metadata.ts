// Identity and primary bases, independent of the size of a marketing/codeshare network.
export const PRIMARY_HUBS: Record<string, string[]> = {
 KLM:['AMS'],AFR:['CDG','ORY'],DLH:['FRA','MUC'],BAW:['LHR','LGW'],IBE:['MAD'],TAP:['LIS','OPO'],DTA:['NBJ'],UAE:['DXB'],QTR:['DOH'],ETH:['ADD'],THY:['IST'],SIA:['SIN'],KQA:['NBO'],RAM:['CMN'],SAA:['JNB'],SWR:['ZRH','GVA'],AUA:['VIE'],BEL:['BRU'],FIN:['HEL'],SAS:['CPH','OSL','ARN'],AEE:['ATH'],EIN:['DUB'],RYR:['DUB','STN'],EZY:['LTN','LGW'],WZZ:['BUD'],VLG:['BCN'],GLO:['GRU','GIG','BSB'],LNK:['JNB','CPT'],GFA:['BAH'],DAL:['ATL','DTW','MSP'],AAL:['DFW','CLT','MIA'],UAL:['ORD','DEN','IAH'],QFA:['SYD','MEL'],ANZ:['AKL'],CPA:['HKG'],ANA:['HND','NRT'],JAL:['HND','NRT'],KAL:['ICN'],ETD:['AUH'],SVA:['JED','RUH'],MSR:['CAI'],TAM:['GRU'],LAN:['SCL'],AVA:['BOG'],CMP:['PTY'],ACA:['YYZ','YUL','YVR'],VOZ:['BNE','MEL','SYD'],TVF:['ORY'],TRA:['AMS'],JST:['MEL'],FDB:['DXB'],IGO:['DEL','BOM'],AIC:['DEL','BOM'],CES:['PVG'],CSN:['CAN'],CCA:['PEK'],MAS:['KUL'],THA:['BKK'],VNA:['HAN','SGN'],AAR:['ICN'],LOT:['WAW'],ROT:['OTP'],ICE:['KEF'],ITY:['FCO'],SBI:['DME'],AFL:['SVO'],PGT:['SAW'],SXS:['AYT'],TUI:['HAJ'],NAX:['OSL'],AXM:['KUL'],FDX:['MEM'],UPS:['SDF']
}
export const alliances: Record<string,string[]> = {
 'Star Alliance':['AEE','ACA','CCA','AIC','ANZ','ANA','AUA','AVA','BEL','CMP','CTN','MSR','ETH','EVA','LOT','DLH','CSZ','SIA','SAA','SWR','TAP','THA','THY','UAL','ITY'],
 'SkyTeam':['ARG','AMX','AEA','AFR','CAL','CES','DAL','GIA','KQA','KLM','KAL','MEA','SVA','SAS','ROT','VNA','VIR','XMN'],
 'oneworld':['ASA','AAL','BAW','CPA','FJI','FIN','IBE','JAL','MAS','OMA','QFA','QTR','RAM','RJA','ALK']
}
export const allianceFor=(icao:string)=>Object.entries(alliances).find(([,codes])=>codes.includes(icao))?.[0] || null
const europeanCountries=new Set(['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Czechia','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden','United Kingdom','Norway','Switzerland'])
// Multi-base operators legitimately fly between other European countries.
const multiBaseEurope=new Set(['RYR','EZY','EJU','EZS','WZZ','WUK','WMT','VLG','VOE','NAX','NSZ','TRA','TVF','TUI','TOM','EXS'])
export function plausibleOperatingRoute(icao:string,home:string,fromCountry:string,toCountry:string){
 if(!home||!fromCountry||!toCountry)return false
 if(fromCountry==='Ukraine'||toCountry==='Ukraine')return false
 const blocked=new Set(['Russia','Belarus'])
 if((europeanCountries.has(home)&&[fromCountry,toCountry].some(c=>blocked.has(c))) || (blocked.has(home)&&[fromCountry,toCountry].some(c=>europeanCountries.has(c))))return false
 if(home===fromCountry||home===toCountry)return true
 return multiBaseEurope.has(icao)&&(europeanCountries.has(fromCountry)||europeanCountries.has(toCountry))
}

// Explicitly retired identities and closed passenger airports in the legacy source.
export const RETIRED_OPERATORS=new Set(['BER','AZA','TCX','MON','NLY','AAF','JAI','BEE','WOW','VRD','USA','COA','ADR','ELL','BMS','GMI','ISS','TSO','AUI','TYR'])
export const CLOSED_AIRPORTS=new Set(['TXL','SXF','THF','FBU','ISL','GZA'])
