import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type BalancePoint = { day: string; balance: number }
type BalanceChartProps = {
  data: BalancePoint[]
  formatMoney: (amount: number) => string
}

export default function BalanceChart({ data, formatMoney }: BalanceChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#edf0f5" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={4} />
        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `₹${value / 1000}k`} />
        <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
        <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2.5} fill="url(#balanceFill)" activeDot={{ r: 5, fill: '#059669' }} isAnimationActive animationDuration={1100} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
