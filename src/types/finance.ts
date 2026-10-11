export type Tx = {
  id: string
  title: string
  category: string
  amount: number
  date: string
  type: 'income' | 'expense'
}

export type Goal = {
  id: string
  name: string
  target: number
  saved: number
  color: string
}

export type Subscription = {
  id: string
  name: string
  amount: number
  due: number
}

export type FinanceData = {
  transactions: Tx[]
  goals: Goal[]
  subscriptions: Subscription[]
}
