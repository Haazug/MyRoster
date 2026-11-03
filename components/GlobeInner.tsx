'use client'
import {usePathname} from 'next/navigation'
import {useGlobeDiscovery,useGlobeCountries} from '@/lib/use-globe-discovery'
import {canDiscoverGlobe,discoveryContext} from '@/lib/globe-discovery'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMapStore, type Point } from '@/lib/map-store'
import { splitRoute, interpolateRoute } from '@/lib/flight-workflow'
import LiveTraffic from './LiveTraffic'

const R = Math.PI / 180
// default live-traffic centre: Luanda (NBJ)
const LUANDA = { lat: -9.0507, lng: 13.4991, altitude: 1 }

function routeCamera(a: Point, b: Point) {
  const p1 = a.lat * R, l1 = a.lon * R, p2 = b.lat * R, l2 = b.lon * R
  const x = Math.cos(p1) * Math.cos(l1) + Math.cos(p2) * Math.cos(l2)
  const y = Math.cos(p1) * Math.sin(l1) + Math.cos(p2) * Math.sin(l2)
  const z = Math.sin(p1) + Math.sin(p2)
  const lat = Math.atan2(z, Math.hypot(x, y)) / R
  const lng = Math.atan2(y, x) / R
  const th = Math.acos(Math.min(1, Math.max(-1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(l2 - l1))))
  const alt = Math.min(3, Math.max(0.35, 0.25 + th * 1.2))
  return { lat, lng, alt }
}

// airports of an airline ordered by how many routes touch them (first = hub)
function topAirports(routes: { from: Point; to: Point }[]) {
  const n = new Map<string, { p: Point; c: number }>()
  for (const r of routes) {
    for (const p of [r.from, r.to]) {
      const k = p.lat + ',' + p.lon
      const e = n.get(k)
      if (e) e.c++
      else n.set(k, { p, c: 1 })
    }
  }
  return Array.from(n.values()).sort((a, b) => b.c - a.c)
}

type Cam = { key: string; lat: number; lng: number; alt: number }

export default function GlobeInner() {
  const [size,setSize]=useState({width:900,height:700})
  const [isIPad,setIsIPad]=useState(false)
  useEffect(()=>{setIsIPad(/iPad/i.test(navigator.userAgent)||(/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1));const resize=()=>setSize({width:window.innerWidth,height:window.innerHeight});resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[])
  const ref = useRef<GlobeMethods | undefined>(undefined)
  const view = useMapStore((s) => s.view)
  const zoomKey = useRef('')
  const pointerStart=useRef<{x:number;y:number}|null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }
  const exploring=useMapStore(s=>s.exploring)
  const selection=useMapStore(s=>s.discoverySelection),select=useMapStore(s=>s.setDiscoverySelection)
  const inFlight=useMapStore(s=>s.view.mode==='route'&&typeof s.view.progress==='number')
  const discovering=canDiscoverGlobe(usePathname(),exploring,inFlight)
  const {data:catalog}=useGlobeDiscovery(discovering),{data:geography}=useGlobeCountries(discovering)
  const discovery=useMemo(()=>discovering&&catalog?discoveryContext(catalog,selection):null,[discovering,catalog,selection])
  const discoveryAirport=discovery?.airport||(discovery?.airline?catalog?.airports.find(a=>a.iata===discovery.airline?.hubs[0]):undefined)
  const discoveryCountryCode=discovery?.country?.code||(selection?.kind==='country'?selection.code:undefined)
  const polygons=useMemo(()=>discovering?geography?.features||[]:[],[discovering,geography])
  const particles=useMemo(()=>!discovering||!catalog?[]:[{airports:catalog.airports.filter(a=>a.iata!==discoveryAirport?.iata),color:'#ffffff',size:size.width<768?5:4},...(discoveryAirport?[{airports:[discoveryAirport],color:'#facc15',size:8}]:[])],[discovering,catalog,discoveryAirport,size.width])

  // Country caps can intercept the ray before a tiny airport particle. Resolve
  // nearby visible dots in screen space too, so touch and mouse behave alike.
  const pickAirport = (event: MouseEvent, coords: {lat:number;lng:number}) => {
    const g=ref.current
    if(!discovering||!catalog||!g)return false
    g.camera().updateMatrixWorld()
    let nearest:typeof catalog.airports[number]|undefined, distance=size.width<768?12:8
    for(const airport of catalog.airports){
      const longitude=Math.abs(((airport.lon-coords.lng+540)%360)-180)
      if(Math.abs(airport.lat-coords.lat)>10||longitude*Math.cos(coords.lat*R)>10)continue
      const screen=g.getScreenCoords(airport.lat,airport.lon,.007)
      const d=Math.hypot(screen.x-event.clientX,screen.y-event.clientY)
      if(d<distance){nearest=airport;distance=d}
    }
    if(!nearest)return false
    select({kind:'airport',id:nearest.iata})
    return true
  }

  // rotation and controls
  useEffect(() => {
    let n = 0
    const apply = () => {
      const c = ref.current?.controls() as any
      if (!c) return false
      c.autoRotate = !exploring && (view.mode === 'idle' || (view.mode === 'airports' && !view.selected))
      c.autoRotateSpeed = 0.5
      c.enableRotate = true
      c.enableZoom = true
      c.minDistance=105
      c.maxDistance=1000
      return true
    }
    if (apply()) return
    const t = setInterval(() => {
      if (apply() || ++n > 40) clearInterval(t)
    }, 250)
    return () => clearInterval(t)
  }, [view.mode, exploring, view.mode==='airports'?view.selected:undefined])

  const hubs = useMemo(() => (!discovering && view.mode === 'airline' ? (view.hubs?.length ? view.hubs.map(p=>({p,c:1})) : topAirports(view.routes)) : []), [discovering,view.mode,view.mode==='airline'?view.routes:undefined,view.mode==='airline'?view.hubs:undefined])

  // where the camera should be for the current view (null = leave it alone)
  const cam: Cam | null = useMemo(() => {
    if(discovering&&selection){
      if(discoveryAirport)return {key:'discovery:airport:'+discoveryAirport.iata,lat:discoveryAirport.lat,lng:discoveryAirport.lon,alt:.6}
      const country=discovery?.country
      if(selection.kind==='country'&&(country||Number.isFinite(selection.lat))){const lat=selection.lat??country!.lat,lng=selection.lon??country!.lon;return {key:'discovery:country:'+selection.code,lat,lng,alt:1.3}}
    }
    if (view.mode === 'airline' && hubs.length) {
      const h = hubs[0].p
      return { key: 'a:' + h.lat.toFixed(2) + ',' + h.lon.toFixed(2), lat: h.lat, lng: h.lon, alt: 0.9 }
    }
    const selected = view.mode==='point' ? view.point : view.mode==='airports' ? view.airports.find(p=>p.iata===view.selected) : undefined
    if(selected) return {key:'p:'+selected.iata,lat:selected.lat,lng:selected.lon,alt:0.55}
    if (view.mode === 'route') {
      const k1 = `${view.from.lat.toFixed(3)},${view.from.lon.toFixed(3)}`
      const k2 = `${view.to.lat.toFixed(3)},${view.to.lon.toFixed(3)}`
      const c = routeCamera(view.from, view.to)
      return { key: 'r:' + [k1, k2].sort().join('|'), lat: c.lat, lng: c.lng, alt: c.alt }
    }
    return null
  }, [view,hubs,discovering,selection,discoveryAirport,discovery])
  const camRef = useRef<Cam | null>(cam)
  camRef.current = cam
  const camKey = cam?.key ?? ''

  // one smooth move per place. Outbound/return of the same route, data refreshes and quick page swaps do not zoom again.
  useEffect(() => {
    if (!camKey) {
      clearTimers()
      // back to a menu: after a short wait (so quick page swaps do not bounce) show the whole globe again
      if(view.mode==='airports')return
      const t = setTimeout(() => {
        if (!zoomKey.current) return
        zoomKey.current = ''
        clearTimers()
        const g = ref.current
        if (!g) return
        const pv = g.pointOfView()
        g.pointOfView({ lat: pv.lat, lng: pv.lng, altitude: 2.5 }, 1600)
      }, 450)
      return () => clearTimeout(t)
    }
    if (zoomKey.current === camKey) return
    clearTimers()
    let tries = 0
    const go = () => {
      const g = ref.current
      const c = camRef.current
      if (!g || !c) {
        if (++tries < 12) later(go, 300)
        return
      }
      zoomKey.current = c.key
      const pv = g.pointOfView()
      const near = Math.abs(pv.lat - c.lat) < 1.5 && Math.abs(pv.lng - c.lng) < 1.5 && Math.abs(pv.altitude - c.alt) < 0.15
      if (!near) g.pointOfView({ lat: c.lat, lng: c.lng, altitude: c.alt }, 1800)
    }
    later(go, 450)
  }, [camKey,view.mode])

  useEffect(() => clearTimers, [])
  useEffect(()=>{
    const zoom=(event:Event)=>{const g=ref.current;if(!g)return;const factor=Number((event as CustomEvent).detail?.factor);if(!Number.isFinite(factor)||factor<=0)return;const pov=g.pointOfView();g.pointOfView({...pov,altitude:Math.min(6,Math.max(.08,pov.altitude*factor))},250)}
    const reset=()=>{const g=ref.current;if(!g)return;const c=camRef.current;g.pointOfView(c?{lat:c.lat,lng:c.lng,altitude:c.alt}:{lat:0,lng:0,altitude:2.5},800)}
    window.addEventListener('myroster:globe-zoom',zoom);window.addEventListener('myroster:globe-reset',reset)
    return()=>{window.removeEventListener('myroster:globe-zoom',zoom);window.removeEventListener('myroster:globe-reset',reset)}
  },[])


  const wps=view.mode==='route'&&view.waypoints&&view.waypoints.length>1?view.waypoints:undefined
  const from=!discovering&&view.mode==='route'?view.from:undefined, to=!discovering&&view.mode==='route'?view.to:undefined
  const network=!discovering&&view.mode==='airline'?view.routes:undefined
  const progress=view.mode==='route'?view.progress:undefined
  const routePoints=useMemo(()=>from&&to?wps||Array.from({length:65},(_,i)=>interpolateRoute(from,to,i/64)):[],[from,to,wps])
  const basePath=useMemo(()=>({pts:routePoints.map(w=>[w.lat,w.lon,0.012]),color:'#68717c'}),[routePoints])
  const paths=useMemo(()=>{
    if(!from||!to)return []
    if(progress===undefined)return wps?[basePath]:[]
    const done=splitRoute(routePoints,progress).done
    return done.length>1?[basePath,{pts:done.map(w=>[w.lat,w.lon,0.016]),color:'#4ade80'}]:[basePath]
  },[from,to,progress,wps,routePoints,basePath])
  const arcs=useMemo(()=>network?network.slice(0,600).map(r=>({startLat:r.from.lat,startLng:r.from.lon,endLat:r.to.lat,endLng:r.to.lon})):from&&to&&progress===undefined&&!wps?[{startLat:from.lat,startLng:from.lon,endLat:to.lat,endLng:to.lon}]:[],[network,from,to,progress===undefined,wps])
  const airports=view.mode==='airports'?view.airports:undefined
  const point=view.mode==='point'?view.point:undefined, nearby=view.mode==='point'?view.nearby:undefined
  const selected=view.mode==='airports'?view.selected:point?.iata
    const hubPts=useMemo<Point[]>(()=>view.mode==='airline'?(view.hubs?.length?hubs:hubs.slice(0,3)).map(h=>h.p):[],[view,hubs])
  const destPts=useMemo<Point[]>(()=>{
    if(view.mode!=='airline')return []
    const skip=new Set(hubPts.map(p=>p.iata)),seen=new Set<string>(),out:Point[]=[]
    for(const r of view.routes.slice(0,600))for(const p of [r.from,r.to]){if(skip.has(p.iata)||seen.has(p.iata))continue;seen.add(p.iata);out.push(p)}
    return out
  },[view,hubPts])
  const points=useMemo(()=>discovering?[]:airports?airports.map(p=>({...p,r:p.iata===selected?0.17:0.09,color:p.iata===selected?'#facc15':'#ffffff'})):point?[{...point,r:0.17,color:'#facc15'},...(nearby||[]).filter(p=>p.iata!==point.iata).map(p=>({...p,r:0.08,color:'#ffffff'}))]:from&&to?[{...from,r:0.18,color:'#facc15'},{...to,r:0.18,color:'#facc15'}]:[...destPts.map(p=>({...p,r:0.1,color:'#ffffff'})),...hubPts.map((p,i)=>({...p,r:i===0?0.24:0.16,color:'#facc15'}))],[discovering,airports,selected,point,nearby,from,to,destPts,hubPts])

  const selectedPoints=useMemo(()=>discoveryAirport?[discoveryAirport]:discovering?[]:point?[point]:from&&to?[from,to]:airports?airports.filter(p=>p.iata===selected):hubs.slice(0,3).map(h=>h.p),[discovering,point,from,to,airports,selected,hubs,discoveryAirport])

  return (
    <div className="relative size-full"
      onPointerDownCapture={discovering?event=>{pointerStart.current={x:event.clientX,y:event.clientY}}:undefined}
      onClickCapture={discovering?event=>{
        const start=pointerStart.current
        pointerStart.current=null
        if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)return
        ref.current?.camera().updateMatrixWorld()
        const coords=ref.current?.toGlobeCoords(event.clientX,event.clientY)
        if(coords&&pickAirport(event.nativeEvent,coords))event.stopPropagation()
      }:undefined}>
      <Globe
        ref={ref}
        waitForGlobeReady={false}
        width={size.width}
        height={size.height}
        globeOffset={discovering&&selection&&size.width<768?[0,-size.height*.18]:!exploring&&isIPad?[Math.min(250-size.width/2,0),0]:[0,0]}
        globeImageUrl="/globe/earth-blue-marble.jpg"
        bumpImageUrl="/globe/earth-topology.png"
        backgroundImageUrl="/globe/night-sky.png"
        atmosphereColor="#1f88ff"
        atmosphereAltitude={0.16}
        polygonsData={polygons}
        polygonAltitude={.001}
        polygonCapColor={()=>'rgba(0,0,0,0)'}
        polygonSideColor={()=>'rgba(0,0,0,0)'}
        polygonStrokeColor={(f:any)=>f.properties.code===discoveryCountryCode?'rgba(255,255,255,.55)':'rgba(255,255,255,.10)'}
        polygonsTransitionDuration={0}
        polygonLabel={(f:any)=>f.properties.name}
        onPolygonClick={discovering?(f:any,event,coords)=>{if(!pickAirport(event,coords))select({kind:'country',code:f.properties.code,name:f.properties.name,lat:coords.lat,lon:coords.lng})}:undefined}
        onGlobeClick={discovering?(coords,event)=>{pickAirport(event,coords)}:undefined}
        lineHoverPrecision={discovering?1:0.2}
        particlesData={particles}
        particlesList="airports"
        particleLat="lat"
        particleLng="lon"
        particleAltitude={.007}
        particlesSize="size"
        particlesColor="color"
        particlesSizeAttenuation={false}
        particleLabel={(p:any)=>p?.iata||''}
        onParticleClick={discovering?(p:any)=>{if(p?.iata)select({kind:'airport',id:p.iata})}:undefined}
        arcsData={arcs}
        arcColor={() => (view.mode === 'route' ? ['rgba(255,255,255,0.9)', 'rgba(31,136,255,1)'] : ['rgba(85,167,255,0.18)', 'rgba(130,195,255,0.9)'])}
        arcStroke={view.mode === 'route' ? 0.85 : 0.22}
        arcAltitudeAutoScale={view.mode === 'route' ? 0.25 : 0.2}
        arcsTransitionDuration={0}
        pathsData={paths}
        pathTransitionDuration={0}
        pathPoints="pts"
        pathPointLat={(p: any) => p[0]}
        pathPointLng={(p: any) => p[1]}
        pathColor={(p:any)=>p.color}
        pathStroke={1.1}
        pathPointAlt={(p:any)=>p[2]??0.012}
        pointsData={points}
        pointsMerge
        pointsTransitionDuration={0}
        labelsTransitionDuration={0}
        pointLat="lat"
        pointLng="lon"
        pointColor={(p: any) => p.color || '#ffffff'}
        pointAltitude={0.002}
        pointRadius={(p: any) => p.r ?? 0.25}
        ringsData={selectedPoints}
        ringLat="lat"
        ringLng="lon"
        ringColor={() => (t: number) => `rgba(250,204,21,${1 - t})`}
        ringMaxRadius={Math.min(4,Math.max(0.5,(cam?.alt||1)*2))}
        ringPropagationSpeed={1.6}
        ringRepeatPeriod={1800}
        labelsData={selectedPoints}
        labelLat="lat"
        labelLng="lon"
        labelText={(p:any)=>`${p.iata} · ${p.city || p.name || ''}`}
        labelSize={Math.max(0.16,(cam?.alt||0.9)*0.6)}
        labelDotRadius={0}
        labelColor={() => 'rgba(255,255,255,0.9)'}
        labelAltitude={0.03}
        labelResolution={2}
      />
      <div className="hidden lg:block"><LiveTraffic getCenter={() => (view.mode === 'idle' ? LUANDA : ref.current?.pointOfView())} /></div>
    </div>
  )
}
