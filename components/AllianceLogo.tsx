import {ALLIANCES} from '@/lib/alliances'
export default function AllianceLogo({slug,size=32,className}:{slug:string;size?:number;symbol?:string;className?:string}){
 const a=ALLIANCES.find(x=>x.slug===slug);if(!a)return null
 return <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ${className||''}`} style={className?undefined:{width:size,height:size}}><img src={a.logo} alt={a.name} loading="lazy" className="h-full w-auto max-w-full object-contain p-0.5"/></span>
}
