// Shared live semantics: proximity discovers aircraft; only a resolved route assigns airports.
export type ResolvedFlight = {
  hex: string; callsign: string; flightNumber: string; airlineIata: string; airlineIcao: string; airlineName: string
  from: string | null; to: string | null; fromCity: string; toCity: string
  type?: string; altFt: number | null; onGround: boolean; gs?: number; lat: number; lon: number
  reg?:string;eta?:number;etaSource?:'schedule'|'position'|'route';transatlantic?:boolean;transcontinental?:boolean;lastSeenPlace?:string;
  id?: string; routeCheckedAt?: number; source?: 'radar' | 'timetable'; updatedAt?: number; expiresAt?: number; departedAt?: number; arrivesAt?: number; serviceDate?: string; terminal?: boolean
  observedAt: number; status: 'observed' | 'estimated'; remainingMinutes: null
}

export function flightIdentity(callsign: string, iata = '', published = '') {
  const cs = callsign.trim().toUpperCase()
  // An operational callsign such as DTA6AB is not a passenger flight number.
  const known = published.trim().toUpperCase()
  if (/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(known)) return known
  const numeric = cs.match(/^[A-Z]{3}(\d{1,4})$/)
  return numeric && iata ? `${iata}${numeric[1]}` : cs
}

export function airportDirection(f: Pick<ResolvedFlight, 'from' | 'to'>, code: string) {
  const key = code.toUpperCase() === 'LAD' ? 'NBJ' : code.toUpperCase()
  return f.from === key ? 'departing' : f.to === key ? 'arriving' : null
}

export class FlightObservations {
  private entries = new Map<string, ResolvedFlight>()
  constructor(private retentionMs = 20 * 60_000, private freshMs = 90_000, private maxEntries = 5000) {}
  record(f: ResolvedFlight) {
    // A newly observed unknown route must not inherit an old flight's endpoints.
    this.entries.delete(f.hex)
    this.entries.set(f.hex, f)
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!)
  }
  snapshot(now = Date.now()) {
    return [...this.entries.values()].filter(f => now < (f.expiresAt ?? f.observedAt + this.retentionMs))
  }
  list(now = Date.now()) {
    const out: ResolvedFlight[] = []
    for (const [key, f] of this.entries) {
      const age = now - f.observedAt
      if (age > this.retentionMs) { this.entries.delete(key); continue }
      if (f.onGround || !f.from || !f.to) continue
      out.push({ ...f, status: age > this.freshMs ? 'estimated' : 'observed', remainingMinutes: null })
    }
    return out
  }
}

export function liveRouteHref(f: Pick<ResolvedFlight, 'from' | 'to' | 'airlineIata' | 'airlineIcao' | 'flightNumber'> & Partial<Pick<ResolvedFlight,'callsign'>>) {
  const airline = f.airlineIata || f.airlineIcao
  if (!f.from || !f.to || !airline) return null
  const query=f.flightNumber?`?flight=${encodeURIComponent(f.flightNumber)}`:f.callsign?`?callsign=${encodeURIComponent(f.callsign)}`:''
  return `/route/${encodeURIComponent(airline)}/${f.from}-${f.to}${query}`
}

// Prefer the longest prefix: DTA must be matched before DT.
export function flightNumberPart(code: string, iata: string, icao: string) {
  code = code.trim().toUpperCase().replace(/[\s-]/g,'')
  if (/^\d{1,4}[A-Z]?$/.test(code)) return code
  const prefix = [iata, icao].filter(Boolean).sort((a, b) => b.length - a.length).find(p => code.startsWith(p))
  const number = prefix ? code.slice(prefix.length) : !iata && !icao ? (code.match(/^(?:[A-Z]{3}|[A-Z0-9]{2})(\d{1,4}[A-Z]?)$/)?.[1] || '') : ''
  return /^\d{1,4}[A-Z]?$/.test(number) ? number : ''
}

export function currentFlights(flights: ResolvedFlight[], now = Date.now()) {
  const terminal = flights.filter(f => f.terminal || f.onGround)
  const visible = flights.filter(f => !f.onGround && !f.terminal && f.from && f.to &&
    now < (f.expiresAt ?? f.observedAt + 20 * 60_000) && !terminal.some(t =>
      (t.updatedAt ?? t.observedAt) >= (f.updatedAt ?? f.observedAt) &&
      ((t.source !== 'timetable' && t.hex && t.hex === f.hex) || (t.flightNumber === f.flightNumber && t.from === f.from && t.to === f.to && t.serviceDate === f.serviceDate))))
  const out = new Map<string, ResolvedFlight>()
  for (const f of visible.sort((a, b) => (a.updatedAt ?? a.observedAt) - (b.updatedAt ?? b.observedAt))) {
    // The same route can have multiple daily services. Keep their departure dates separate.
    const key = `${f.flightNumber}|${f.from}|${f.to}|${f.serviceDate || new Date(f.observedAt).toISOString().slice(0, 10)}`
    const existing = out.get(key)
    const radarFresh = f.source !== 'timetable' && now - f.observedAt <= 90_000
    if (existing && existing.source !== 'timetable' && now - existing.observedAt <= 90_000 && !radarFresh) continue
    out.set(key, { ...f, status: radarFresh ? 'observed' : 'estimated', remainingMinutes: null })
  }
  return [...out.values()]
}

// This bounds how long a lost position may remain an estimate; it is not a displayed ETA.
export function radarExpiry(at: number, distanceNm?: number, speedKt?: number) {
  if (distanceNm != null && Number.isFinite(distanceNm) && distanceNm >= 0 && distanceNm < 15) return at + 5 * 60_000
  if (distanceNm == null || !Number.isFinite(distanceNm) || distanceNm < 0 || !speedKt || speedKt < 100 || speedKt > 800) return at + 20 * 60_000
  return Math.round(at + Math.min(18 * 3600_000, Math.max(10 * 60_000, distanceNm / speedKt * 3600_000 + 10 * 60_000)))
}

export function displayFlightNumber(code:string,iata='',icao=''){
 const raw=String(code||'').trim().toUpperCase().replace(/[\s-]/g,'')
 if(/^\d{1,4}[A-Z]?$/.test(raw))return `${iata||icao}${raw}`
 return /^(?:[A-Z]{3}|[A-Z0-9]{2})\d[A-Z0-9]{0,5}$/.test(raw)?raw:''
}

// An operational suffix (KLM4XY) is retained as a callsign, never converted to a passenger number.
export function operationalCallsign(code:string,icao:string){
 const raw=String(code||'').trim().toUpperCase().replace(/[\s-]/g,'')
 return icao && raw.startsWith(icao) && /^\d[A-Z0-9]{0,4}$/.test(raw.slice(icao.length)) ? raw : ''
}
