'use client'
import {useEffect} from 'react'
import {usePathname} from 'next/navigation'
import {Globe2,PanelRightOpen,Plus,Minus,LocateFixed} from 'lucide-react'
import {useMapStore} from '@/lib/map-store'
import {useT} from '@/lib/i18n'
import {globeNavAllowed} from '@/lib/globe-rules'
export default function GlobeInteraction(){
 const t=useT(),path=usePathname(),exploring=useMapStore(s=>s.exploring),setExploring=useMapStore(s=>s.setExploring)
 const inFlight=useMapStore(s=>s.view.mode==='route'&&typeof s.view.progress==='number')
 const allowed=globeNavAllowed(path,inFlight)
 useEffect(()=>setExploring(false),[path,setExploring])
 useEffect(()=>{if(!allowed)setExploring(false)},[allowed,setExploring])
 const zoom=(factor:number)=>window.dispatchEvent(new CustomEvent('myroster:globe-zoom',{detail:{factor}}))
 if(!allowed)return null
 return <div className={`fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/75 p-1 backdrop-blur lg:left-48 lg:translate-x-0 ${exploring?'bottom-24 max-w-[calc(100%-24px)] lg:bottom-auto lg:top-2 lg:max-w-none':'top-2 max-w-[calc(100%-180px)] lg:max-w-none'}`}>
 <button onClick={()=>setExploring(!exploring)} aria-pressed={exploring} className="flex min-h-9 min-w-0 items-center gap-2 px-2 text-xs text-white/75">{exploring?<PanelRightOpen className="size-4 shrink-0"/>:<Globe2 className="size-4 shrink-0"/>}<span className="truncate">{t(exploring?'globe.return':'globe.explore')}</span></button>
 {exploring&&<><button aria-label={t('globe.zoomIn')} onClick={()=>zoom(.8)} className="flex size-9 shrink-0 items-center justify-center text-white/75"><Plus className="size-4"/></button><button aria-label={t('globe.zoomOut')} onClick={()=>zoom(1.25)} className="flex size-9 shrink-0 items-center justify-center text-white/75"><Minus className="size-4"/></button><button aria-label={t('globe.reset')} onClick={()=>window.dispatchEvent(new Event('myroster:globe-reset'))} className="flex size-9 shrink-0 items-center justify-center text-white/75"><LocateFixed className="size-4"/></button></>}
 </div>
}