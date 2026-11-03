'use client'
import {supabase} from '@/lib/supabase'
export const SHAPES=['circle','square','shield','diamond'] as const
export type Shape=(typeof SHAPES)[number]
export type CustomRoute={from:string;to:string}
export type CustomAirline={id:string;owner:string;owner_name:string|null;name:string;initials:string;shape:Shape;color1:string;color2:string;hub:string;routes:CustomRoute[];created_at:string}
export type NewAirline=Omit<CustomAirline,'id'|'owner'|'created_at'>

// basic client-side filter; the real moderation is the Report button (3 reports hide an airline)
const BAD=['fuck','shit','bitch','pussy','nazi','hitler','kkk','porra','caralho','puta','merda','foda','cona','cazzo','merde','putain','mierda','puto']
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
export function badName(name:string){
 const n=norm(name),tokens=n.split(/[^a-z0-9]+/).filter(Boolean),compact=n.replace(/[^a-z0-9]/g,'')
 return BAD.some(w=>tokens.includes(w)||(w.length>=5&&compact.includes(w)))
}
async function uid(){const {data}=await supabase.auth.getSession();return data.session?.user.id||null}
export async function listPublished(){const {data,error}=await supabase.from('custom_airlines').select('*').order('created_at',{ascending:false}).limit(100);if(error)throw error;return (data||[]) as CustomAirline[]}
export async function listSaved(){
 const u=await uid();if(!u)return [] as CustomAirline[]
 const {data,error}=await supabase.from('saved_airlines').select('custom_airlines(*)').eq('user_id',u).order('created_at',{ascending:false});if(error)throw error
 return (data||[]).map((r:any)=>r.custom_airlines).filter(Boolean) as CustomAirline[]
}
export async function getAirline(id:string){const {data,error}=await supabase.from('custom_airlines').select('*').eq('id',id).maybeSingle();if(error)throw error;return data as CustomAirline|null}
export async function isSaved(id:string){const u=await uid();if(!u)return false;const {data}=await supabase.from('saved_airlines').select('airline_id').eq('user_id',u).eq('airline_id',id).maybeSingle();return !!data}
export async function setSaved(id:string,on:boolean){
 const u=await uid();if(!u)throw Error('login')
 if(on){const {error}=await supabase.from('saved_airlines').upsert({user_id:u,airline_id:id});if(error)throw error}
 else{const {error}=await supabase.from('saved_airlines').delete().eq('user_id',u).eq('airline_id',id);if(error)throw error}
}
export async function publishAirline(a:NewAirline){
 const u=await uid();if(!u)throw Error('login')
 const {data,error}=await supabase.from('custom_airlines').insert({...a,owner:u}).select('id').single();if(error)throw error
 return data.id as string
}
export async function reportAirline(id:string){
 const u=await uid();if(!u)throw Error('login')
 const {error}=await supabase.from('airline_reports').insert({airline_id:id,reporter:u});if(error&&error.code!=='23505')throw error
}
export async function deleteAirline(id:string){const {error}=await supabase.from('custom_airlines').delete().eq('id',id);if(error)throw error}
// the owner's most recent visible airline, shown on the profile card
export async function featuredAirline(userId:string){
 const {data}=await supabase.from('custom_airlines').select('id,name,initials,shape,color1,color2').eq('owner',userId).eq('hidden',false).order('created_at',{ascending:false}).limit(1).maybeSingle()
 return (data||undefined) as PilotAirline|undefined
}
export type PilotAirline={id:string;name:string;initials:string;shape:Shape;color1:string;color2:string}
