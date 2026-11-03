import type {CustomAirline} from '@/lib/custom-airlines'
export default function CustomAirlineLogo({a,size=48}:{a:Pick<CustomAirline,'initials'|'shape'|'color1'|'color2'>;size?:number}){
 const body=a.shape==='square'?<rect x="6" y="6" width="88" height="88" rx="18" fill={a.color1}/>
  :a.shape==='shield'?<path d="M50 5 L90 20 V50 C90 75 70 90 50 96 C30 90 10 75 10 50 V20 Z" fill={a.color1}/>
  :a.shape==='diamond'?<path d="M50 4 L96 50 L50 96 L4 50 Z" fill={a.color1}/>
  :<circle cx="50" cy="50" r="46" fill={a.color1}/>
 return <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={a.initials} className="shrink-0">{body}<text x="50" y="52" textAnchor="middle" dominantBaseline="central" fontSize={a.initials.length>2?30:38} fontWeight={700} fill={a.color2} fontFamily="system-ui,sans-serif">{a.initials}</text></svg>
}
