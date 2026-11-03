import Link from 'next/link'
import { Flag } from '@/components/Flag'
import CustomAirlineLogo from '@/components/CustomAirlineLogo'
import type { PilotProfile } from '@/lib/pilot-profile'

export function PilotBadge({ pilot, children }: { pilot: PilotProfile; children?: React.ReactNode }) {
  const seed = String(pilot.id || pilot.name)
  const bars = Array.from({ length: 36 }, (_, i) => 1 + ((seed.charCodeAt(i % seed.length) + i * 7) % 3))
  const shortId = seed.replace('pilot_', '').slice(-6).toUpperCase()
  return (
    <div className="mx-auto w-full max-w-[290px] overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] shadow-2xl">
      <div className="relative bg-[#1f88ff] px-5 pb-10 pt-7 text-white">
        <div className="absolute left-1/2 top-2.5 h-2 w-14 -translate-x-1/2 rounded-full bg-black/60" />
        <p className="text-center text-[10px] font-semibold uppercase tracking-[.4em]">Pilot</p>
      </div>
      <div className="px-5 pb-5 text-center">
        <div className="-mt-12 mx-auto flex size-24 items-center justify-center overflow-hidden rounded-full border-4 border-[#0a0a0a] bg-[#16181d] text-3xl font-semibold text-[#55a7ff]">
          {pilot.avatar ? <img src={pilot.avatar} alt="" className="size-full object-cover" /> : pilot.name.charAt(0).toUpperCase()}
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">{pilot.name}</h2>
        {pilot.username && <p className="text-sm text-white/50">@{pilot.username}</p>}
        {pilot.nationality && (
          <p className="mt-2 flex items-center justify-center gap-2 text-sm text-white/60">
            <Flag country={pilot.nationality} size={24} />
            {pilot.nationality}
          </p>
        )}
        {pilot.airline && (
          <Link href={`/community/${pilot.airline.id}`} className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 py-1 pl-1 pr-3 text-sm">
            <CustomAirlineLogo a={pilot.airline} size={28} />
            <span className="min-w-0 truncate">{pilot.airline.name}</span>
          </Link>
        )}
        {pilot.developer && <p className="mt-2 inline-block rounded-full border border-[#1f88ff]/50 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#55a7ff]">Developer</p>}
        <div className="mt-5 flex items-end justify-center gap-[2px]" aria-hidden="true">
          {bars.map((w, i) => (
            <span key={i} className="h-9 bg-white/80" style={{ width: w }} />
          ))}
        </div>
        <p className="mt-2 font-mono text-[10px] tracking-[.3em] text-white/35">ID {shortId}</p>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  )
}
