import { estimateBlockMinutes } from '@/lib/flight-time'
type Ap = { lat?: number; lon?: number }
type R = { fromAirport?: Ap; toAirport?: Ap; aircraft?: string[] }
export const parseHours = (s: string) => Number(String(s).replace(',', '.')) || 0
// exato: ±5–30 min · aproximado: ±35 min–1 h
export const tolerance = (targetMin: number, precise: boolean) =>
  precise ? Math.min(30, Math.max(5, Math.round(targetMin * 0.08))) : Math.min(60, Math.max(35, Math.round(targetMin * 0.15)))
export function nmBetween(a?: Ap, b?: Ap) {
  if (a?.lat == null || a?.lon == null || b?.lat == null || b?.lon == null) return 0
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return Math.round(2 * 3440.07 * Math.asin(Math.sqrt(h)))
}
export function routeMinutes(r: R) {
  const nm = nmBetween(r.fromAirport, r.toAirport)
  const min = nm ? estimateBlockMinutes(nm, r.aircraft?.[0] || '') : 0
  return { nm, min }
}
export function matchesTime(r: R, hours: number, precise: boolean) {
  const target = hours * 60
  const { min } = routeMinutes(r)
  return !!min && Math.abs(min - target) <= tolerance(target, precise)
}
