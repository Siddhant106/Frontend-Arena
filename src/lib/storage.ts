import type { FinanceData } from '../types/finance'

/** Browser storage is optional. A storage failure should not break the current session. */
export function safeStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage can be disabled, unavailable, or full.
  }
}

function isFinanceData(value: unknown): value is FinanceData {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<FinanceData>
  if (!Array.isArray(candidate.transactions) || !Array.isArray(candidate.goals) ||
      !Array.isArray(candidate.subscriptions)) return false

  const validTransactions = candidate.transactions.every((item) =>
    Boolean(item) && typeof item.id === 'string' &&
    typeof item.title === 'string' && typeof item.category === 'string' &&
    typeof item.date === 'string' && Number.isFinite(item.amount) && item.amount >= 0 &&
    (item.type === 'income' || item.type === 'expense'),
  )
  const validGoals = candidate.goals.every((item) =>
    Boolean(item) && typeof item.id === 'string' && typeof item.name === 'string' &&
    Number.isFinite(item.target) && item.target >= 0 &&
    Number.isFinite(item.saved) && item.saved >= 0 && typeof item.color === 'string',
  )
  const validSubscriptions = candidate.subscriptions.every((item) =>
    Boolean(item) && typeof item.id === 'string' && typeof item.name === 'string' &&
    Number.isFinite(item.amount) && item.amount >= 0 &&
    Number.isFinite(item.due) && item.due >= 1 && item.due <= 31,
  )
  return validTransactions && validGoals && validSubscriptions
}

/** Read and validate saved demo data, falling back to the supplied sample state. */
export function loadFinanceData(fallback: FinanceData): FinanceData {
  try {
    const raw = localStorage.getItem('paisapilot-data')
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    return isFinanceData(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}
