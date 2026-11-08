'use client'
import type {ReactNode} from 'react'
import {useMapStore} from '@/lib/map-store'
import Copilot from '@/components/Copilot'
export default function AppContent({children}:{children:ReactNode}){
 const exploring=useMapStore(s=>s.exploring)
 return <>
  <main aria-hidden={exploring||undefined} inert={exploring||undefined} className={`relative z-10 min-h-screen pt-12 pb-24 sm:pb-40 lg:ml-[440px] xl:ml-[500px] lg:max-w-[760px] ${exploring?'invisible pointer-events-none':''}`}>{children}</main>
  <Copilot/>
 </>
}
