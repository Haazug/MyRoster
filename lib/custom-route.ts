export const pt = (a: any) =>
  a && Number.isFinite(a.lat) && Number.isFinite(a.lon)
    ? { iata: String(a.iata || ''), city: String(a.city || ''), lat: a.lat as number, lon: a.lon as number }
    : undefined
export const askPersist = () => { try { void navigator.storage?.persist?.() } catch {} }
