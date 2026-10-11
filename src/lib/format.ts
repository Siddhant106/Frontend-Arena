/** Format whole-rupee values consistently using Indian digit grouping. */
export const money = (amount: number): string =>
  '₹' + Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString('en-IN')

/** Small client-side identifier for demo records; not a security token. */
export const uid = (): string =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12)
