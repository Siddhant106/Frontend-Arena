/* eslint-disable no-useless-escape */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { FinanceData, Goal, Tx } from './types/finance'
import { money, uid } from './lib/format'
import { loadFinanceData, safeStorageSet } from './lib/storage'
import { Sparkles, Send, Moon, Sun } from 'lucide-react'
import {
  Activity, ArrowDownLeft, ArrowUpRight, Bell, CalendarDays,
  Check, ChevronDown, CircleDollarSign, CreditCard, Gauge,
  LayoutDashboard, Plus, RefreshCw, ShieldCheck, ShoppingBag,
  Target, TrendingDown, TrendingUp, Wallet, X, Zap,
  AlertTriangle, SlidersHorizontal,
} from 'lucide-react'
const BalanceForecastChart = lazy(() => import('./components/BalanceForecastChart'))

const initialData: FinanceData = {
  transactions: [
    { id: '1', title: 'Monthly allowance', category: 'Income', amount: 10000, date: 'Oct 1', type: 'income' },
    { id: '2', title: 'Hostel & essentials', category: 'Essentials', amount: 1500, date: 'Oct 2', type: 'expense' },
    { id: '3', title: 'Groceries', category: 'Food', amount: 620, date: 'Oct 3', type: 'expense' },
    { id: '4', title: 'Travel & commute', category: 'Travel', amount: 380, date: 'Oct 4', type: 'expense' },
    { id: '5', title: 'Coffee with friends', category: 'Lifestyle', amount: 250, date: 'Oct 5', type: 'expense' },
    { id: '6', title: 'Mobile recharge', category: 'Bills', amount: 299, date: 'Oct 7', type: 'expense' },
    { id: '7', title: 'Study supplies', category: 'Education', amount: 451, date: 'Oct 8', type: 'expense' },
  ],
  goals: [
    { id: 'g1', name: 'Emergency fund', target: 2000, saved: 900, color: '#16a34a' },
    { id: 'g2', name: 'New headphones', target: 2500, saved: 500, color: '#7c6cf2' },
    { id: 'g3', name: 'Weekend trip', target: 1500, saved: 350, color: '#f59e0b' },
  ],
  subscriptions: [
    { id: 's1', name: 'Music streaming', amount: 119, due: 12 },
    { id: 's2', name: 'Video streaming', amount: 149, due: 18 },
    { id: 's3', name: 'Cloud storage', amount: 75, due: 22 },
  ],
}


type CoachIntent =
  | 'purchase'
  | 'savings'
  | 'spending'
  | 'subscriptions'
  | 'daily-budget'
  | 'balance'
  | 'goals'
  | 'help';

type ParsedCoachQuery = {
  normalized: string;
  intents: CoachIntent[];
  amount: number | null;
  days: number;
};

function normalizeCoachQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/[₹]/g, ' rs ')
    .replace(/[’']/g, '')
    .replace(/[?!.;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCoachAmount(text: string): number | null {
  const q = normalizeCoachQuery(text);

  // Prefer explicit currency/amount formats so "next 7 days, ₹2k" picks ₹2k.
  const explicit = q.match(
    /(?:rs\s*)(\d+(?:\.\d+)?)\s*(k|thousand|rupees|rupee|rs)?\b|\b(\d+(?:\.\d+)?)\s*(k|thousand|rupees|rupee)\b/i
  );
  const plain = explicit
    ? null
    : q.match(/\b(\d+(?:\.\d+)?)\b/);

  if (!explicit && !plain) return null;

  const value = Number(explicit ? (explicit[1] ?? explicit[3]) : plain?.[1]);
  const unit = (explicit ? (explicit[2] ?? explicit[4]) : '')?.toLowerCase();
  const amount = unit === 'k' || unit === 'thousand' ? value * 1000 : value;

  // Ignore a bare number when it is clearly a time-period count.
  if (!explicit && /\b\d+\s*(days?|din|weeks?|hafte|months?|mahine)\b/.test(q)) {
    return null;
  }

  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) return null;
  return Math.round(amount);
}

function parseCoachDays(text: string): number {
  const q = normalizeCoachQuery(text);

  if (/\b(today|aaj|for today|aaj ka)\b/.test(q)) return 1;
  if (/\b(this week|iss week|is hafte|next 7 days|agle 7 din)\b/.test(q)) return 7;
  if (/\b(this month|iss month|is mahine|monthly)\b/.test(q)) return 30;

  const match = q.match(
    /\b(?:next|agle|for|in|within|agley)\s+(\d{1,3})\s*(days?|din|weeks?|hafte|hafton|months?|mahine)\b/
  );
  if (!match) return 30;

  const count = Number(match[1]);
  const unit = match[2];
  const days = /week|hafte|hafton/.test(unit)
    ? count * 7
    : /month|mahine/.test(unit)
      ? count * 30
      : count;

  return Math.max(1, Math.min(days, 365));
}

function detectCoachIntents(text: string): CoachIntent[] {
  const q = normalizeCoachQuery(text);
  const found: CoachIntent[] = [];

  const rules: Array<[CoachIntent, RegExp]> = [
    ['subscriptions', /\b(subscription|subscriptions|recurring|renewal|monthly bill|bills|bill|netflix|spotify|membership|autopay|auto pay)\b/],
    ['goals', /\b(goal|goals|target|goal progress|goal deadline|goal target|fund my)\b/],
    ['daily-budget', /\b(daily budget|per day|each day|daily allowance|safe to spend|daily spending limit|next \d+ days? budget|next \d+ days? ka budget|agle \d+ din ka budget|aaj ka budget|roz ka budget|har din|today budget)\b/],
    ['balance', /\b(balance|financial health|financial status|money left|remaining money|available money|budget summary|financial summary|financial situation|budget status|kitne paise|kitna bacha)\b/],
    ['purchase', /\b(buy|purchase|afford|affordable|khareed|kharid|lena hai|le sakta|le sakti|spend on|cost|price|worth it|headphones?|laptop|phone|mobile|earphones?|shoes?)\b/],
    ['savings', /\b(save|saving|savings|bachao|bachana|bachaun|bacha sakta|bacha sakti|set aside|side me rakh|paise jod)\b/],
    ['spending', /\b(spend|spending|spent|expense|expenses|kharcha|kharch|reduce|cut expenses|kam kar|kam karo|overspending|wasting money|where does my money go|shopping expenses|spend less)\b/],
    ['help', /\b(help|what can you do|how do you work|what can i ask|show examples|options|commands|kaise help|kya kar sakte)\b/],
  ];

  for (const [intent, pattern] of rules) {
    if (pattern.test(q) && !found.includes(intent)) found.push(intent);
  }

  // Interpret common questions that don't always use an explicit keyword.
  if (/\bhow much\b.*\b(can i spend|should i spend)\b/.test(q) && !found.includes('daily-budget')) {
    found.push('daily-budget');
  }
  if (/\bhow much\b.*\b(can i save|could i save)\b/.test(q) && !found.includes('savings')) {
    found.push('savings');
  }

  return found;
}

function parseCoachQuery(text: string): ParsedCoachQuery {
  return {
    normalized: normalizeCoachQuery(text),
    intents: detectCoachIntents(text),
    amount: parseCoachAmount(text),
    days: parseCoachDays(text),
  };
}

const nav = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Smart Budget', icon: SlidersHorizontal },
  { name: 'Transactions', icon: ArrowDownLeft },
  { name: 'Decision lab', icon: Zap },
  { name: 'Savings goals', icon: Target },
  { name: 'Commitments', icon: CreditCard },
  { name: 'Spending Coach', icon: Sparkles },
]

export default function App() {
  const [data, setData] = useState<FinanceData>(() => loadFinanceData(initialData))
  const defaultCategoryLimits: Record<string, number> = { Food: 1800, Travel: 1200, Essentials: 2500, Lifestyle: 800, Bills: 600, Education: 1000, Shopping: 700, Unexpected: 500, Other: 500 }
  const [categoryLimits, setCategoryLimits] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('paisapilot-category-limits')
      return saved ? { ...defaultCategoryLimits, ...(JSON.parse(saved) as Record<string, number>) } : defaultCategoryLimits
    } catch { return defaultCategoryLimits }
  })
  const [page, setPage] = useState('Overview')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem('paisapilot-theme') === 'dark' ? 'dark' : 'light' }
    catch { return 'light' }
  })
  const [showAdd, setShowAdd] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [toast, setToast] = useState('')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('500')
  const [category, setCategory] = useState('Food')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [simAmount, setSimAmount] = useState(1200)
  const [simKind, setSimKind] = useState('Purchase')
  const [applied, setApplied] = useState(false)
  const [newGoal, setNewGoal] = useState(false)
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('2000')
  const [coachQuestion, setCoachQuestion] = useState('')
  const [coachReply, setCoachReply] = useState<{
  title: string
  verdict: string
  explanation: string
  actions: string[]
  tone: 'green' | 'amber' | 'red' | 'violet'
} | null>(null)

  useEffect(() => {
    safeStorageSet('paisapilot-data', JSON.stringify(data))
  }, [data])

  useEffect(() => {
    try { localStorage.setItem('paisapilot-theme', theme) } catch { /* storage may be unavailable */ }
  }, [theme])

  useEffect(() => {
    safeStorageSet('paisapilot-category-limits', JSON.stringify(categoryLimits))
  }, [categoryLimits])

  const spent = useMemo(
    () => data.transactions.reduce((s, t) => s + (t.type === 'expense' ? t.amount : 0), 0),
    [data.transactions],
  )
  const income = useMemo(
    () => data.transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : 0), 0),
    [data.transactions],
  )
  const balance = income - spent
  const today = Math.min(new Date().getDate(), 30)
  const daysLeft = Math.max(1, 30 - today)
  const bills = data.subscriptions.reduce((s, x) => s + x.amount, 0)
  const spendable = Math.max(0, balance - bills)
  const daily = spendable / daysLeft
  const savings = data.goals.reduce((s, g) => s + g.saved, 0)
  const score = Math.max(0, Math.min(100, Math.round(
    55 + (balance / Math.max(income, 1)) * 30 - (spent / 10000) * 10
      + (savings > 0 ? 5 : 0),
  )))
  const risk = balance < bills ? 'High' : daily < 150 ? 'Moderate' : 'Low'

  const chartData = useMemo(() => {
    const result = []
    let running = 10000
    const days = [
      ['1', 0], ['2', 1500], ['3', 620], ['4', 380],
      ['5', 250], ['6', 0], ['7', 299], ['8', 451],
    ] as [string, number][]
    for (let i = 0; i < days.length; i++) {
      if (i > 0) running -= days[i][1]
      result.push({ day: 'Oct ' + days[i][0], balance: running })
    }
    const actual = balance
    result[result.length - 1].balance = actual
    for (let i = 9; i <= 30; i++) {
      result.push({
        day: 'Oct ' + i,
        balance: Math.max(0, actual - ((actual - bills) / 22) * (i - 8)),
      })
    }
    return result
  }, [balance, bills])

  
  function askCoach(question = coachQuestion) {
    const rawQuestion = question.trim();

    if (!rawQuestion) {
      notify('Ask a question about your finances.');
      return;
    }

    const parsed = parseCoachQuery(rawQuestion);
    const q = parsed.normalized;
    const intents = parsed.intents;
    const purchaseAmount = parsed.amount ?? 0;
    const periodDays = Math.min(parsed.days, Math.max(1, daysLeft));

    const available = Math.max(0, balance - bills);
    const afterBalance = balance - purchaseAmount;
    const afterAvailable = Math.max(0, afterBalance - bills);
    const afterDaily = afterAvailable / Math.max(1, daysLeft);

    type CoachSection = {
      title: string;
      verdict: string;
      explanation: string;
      actions: string[];
      tone: 'green' | 'amber' | 'red' | 'violet';
    };

    const sections: CoachSection[] = [];
    const addSection = (
      title: string,
      verdict: string,
      explanation: string,
      actions: string[],
      tone: CoachSection['tone']
    ) => sections.push({ title, verdict, explanation, actions, tone });

    // Purchase affordability is checked using the app's own recorded numbers.
    if (intents.includes('purchase') || purchaseAmount > 0 || /\b(emergency|unexpected expense)\b/.test(q)) {
      if (purchaseAmount <= 0) {
        addSection(
          'Check a purchase',
          'Enter the purchase amount',
          `Your recorded balance is ${money(balance)}, with ${money(available)} remaining after listed subscriptions. Add an amount, for example “Can I afford ₹1,500?”`,
          ['Include the amount in your question', 'Keep upcoming essentials covered'],
          'violet'
        );
      } else if (purchaseAmount > balance) {
        addSection(
          'This purchase exceeds your balance',
          `${money(purchaseAmount - balance)} above your balance`,
          `The purchase costs ${money(purchaseAmount)}, while your recorded balance is ${money(balance)}. It exceeds your balance by ${money(purchaseAmount - balance)}.`,
          ['Consider delaying the purchase', 'Compare lower-cost alternatives', 'Recheck after income is actually received'],
          'red'
        );
      } else if (purchaseAmount > available) {
        addSection(
          'Protect your upcoming commitments',
          `${money(purchaseAmount - available)} above spendable funds`,
          `Your balance can cover this purchase, but reserving ${money(bills)} for listed subscriptions leaves ${money(available)} available. This purchase would exceed that amount.`,
          ['Prioritize upcoming bills', 'Consider a lower-cost option', 'Reassess when your budget changes'],
          'red'
        );
      } else if (purchaseAmount > daily * 5) {
        addSection(
          'Consider waiting before buying',
          `${Math.round(purchaseAmount / Math.max(daily, 1))} days of daily allowance`,
          `The purchase fits within your current available funds, but your estimated daily allowance would change from ${money(daily)} to about ${money(afterDaily)}.`,
          ['Wait 24 hours before deciding', 'Compare alternatives', 'Check the effect on savings goals'],
          'amber'
        );
      } else {
        addSection(
          'This purchase appears manageable',
          `${money(afterBalance)} projected balance`,
          `Based on your recorded data, the purchase fits within available funds. Your estimated daily allowance afterward would be about ${money(afterDaily)}. Check essential expenses and goal deadlines before deciding.`,
          ['Check upcoming essential expenses', 'Keep savings targets realistic', 'Use the decision simulator to compare scenarios'],
          'green'
        );
      }
    }

    if (intents.includes('subscriptions')) {
      const largest = [...data.subscriptions].sort((a, b) => b.amount - a.amount)[0];
      addSection(
        'Review your subscriptions',
        `${money(bills)} in recurring costs`,
        largest
          ? `Your largest listed subscription is ${largest.name}, costing ${money(largest.amount)}. Review whether you still need it before the next billing date.`
          : 'You have no subscriptions recorded. Review upcoming essential bills instead.',
        ['Review services you rarely use', 'Check upcoming payment dates', 'Keep essential services in your budget'],
        'violet'
      );
    }

    if (intents.includes('spending')) {
      const optional = data.transactions
        .filter(t => t.type === 'expense' && ['Lifestyle', 'Shopping'].includes(t.category))
        .reduce((sum, t) => sum + t.amount, 0);
      addSection(
        'Your spending reset',
        `${money(optional)} in lifestyle and shopping expenses`,
        `You have ${money(available)} available after listed subscriptions. Review your recorded lifestyle and shopping expenses for possible savings, without cutting essentials.`,
        ['Set a weekly optional-spending limit', 'Wait 24 hours before non-essential purchases', 'Review repeat purchases and subscriptions'],
        'violet'
      );
    }

    if (intents.includes('savings') || intents.includes('goals')) {
      const nextGoal = [...data.goals]
        .filter(g => g.saved < g.target)
        .sort((a, b) => (a.target - a.saved) - (b.target - b.saved))[0];

      if (!nextGoal) {
        addSection(
          'Savings check',
          'No unfinished goals found',
          `You have ${money(savings)} recorded across your goals. Your available balance after listed subscriptions is ${money(available)}. Keep essential expenses covered before setting another target.`,
          ['Review your emergency buffer', 'Set a realistic new savings goal'],
          'green'
        );
      } else {
        const remaining = nextGoal.target - nextGoal.saved;
        const dailyTarget = remaining / Math.max(1, periodDays);
        addSection(
          `Your ${nextGoal.name} goal`,
          `${money(remaining)} still needed`,
          `You have saved ${money(nextGoal.saved)} of ${money(nextGoal.target)}. To reach this target over ${periodDays} day(s), you would need to set aside about ${money(dailyTarget)} per day. This is a target, not a guarantee that the money is available.`,
          ['Cover essential bills first', 'Extend the deadline if needed', 'Save only what your budget can support'],
          dailyTarget > daily ? 'amber' : 'green'
        );
      }
    }

    if (intents.includes('daily-budget')) {
      const periodBudget = Math.round(daily * periodDays);
      addSection(
        'Your spending allowance',
        `${money(daily)} per day`,
        `Your estimated allowance is ${money(daily)} per day. Over ${periodDays} day(s), that is approximately ${money(periodBudget)}, based on your recorded balance and listed subscriptions.`,
        ['Prioritize essential expenses', 'Track spending during this period', 'Recheck after adding a transaction'],
        'green'
      );
    }

    if (intents.includes('balance')) {
      addSection(
        'Your financial snapshot',
        `${money(balance)} current balance`,
        `Your recorded income is ${money(income)}, expenses are ${money(spent)}, and listed subscriptions total ${money(bills)}. Your estimated health score is ${score}/100.`,
        ['Review your largest expense categories', 'Account for upcoming bills', 'Check your savings goals'],
        risk === 'High' ? 'red' : risk === 'Moderate' ? 'amber' : 'green'
      );
    }

    if (intents.includes('help')) {
      addSection(
        'Here is what I can help with',
        'Choose a finance topic',
        'I can estimate purchase affordability, explain your daily allowance, review spending habits, summarize your balance, discuss listed subscriptions, and calculate savings-goal progress.',
        ['Can I afford ₹1,500?', 'How can I reduce my spending?', 'What is my budget for the next 7 days?', 'How is my savings goal progressing?'],
        'violet'
      );
    }

    if (sections.length === 0) {
      addSection(
        'Your financial snapshot',
        `${risk} estimated risk`,
        `Your recorded balance is ${money(balance)}, listed subscriptions total ${money(bills)}, your estimated financial health score is ${score}/100, and your daily allowance is about ${money(daily)}. I couldn't confidently identify a specific intent in your question, so here is your current snapshot.`,
        ['Ask: Can I afford ₹1,500?', 'Ask: How can I reduce spending?', 'Ask: What is my budget for the next 7 days?'],
        'violet'
      );
    }

    const uniqueActions = [...new Set(sections.flatMap(section => section.actions))].slice(0, 6);
    const tones: CoachSection['tone'][] = sections.map(section => section.tone);
    const overallTone: CoachSection['tone'] =
      tones.includes('red') ? 'red' :
      tones.includes('amber') ? 'amber' :
      tones.includes('green') ? 'green' : 'violet';

    setCoachReply({
      title: sections.length > 1 ? 'Your combined money plan' : sections[0].title,
      verdict: sections.map(section => section.verdict).join(' · '),
      explanation: sections.map(section => `${section.title}: ${section.explanation}`).join('\n\n'),
      actions: uniqueActions,
      tone: overallTone,
    });
  }

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2500)
  }

  function addTransaction() {
    const value = Number(amount)
    if (!title.trim() || !Number.isFinite(value) || value <= 0) {
      notify('Enter a title and a valid amount.')
      return
    }
    setData(old => ({
      ...old,
      transactions: [{
        id: uid(), title: title.trim(), category, amount: value,
        date: 'Today', type,
      }, ...old.transactions],
    }))
    setTitle('')
    setAmount('500')
    setShowAdd(false)
    notify('Transaction added successfully.')
  }

  function applySimulation() {
    if (applied) return
    if (simKind === 'Purchase' && simAmount > balance) {
      notify('This purchase exceeds your available balance.')
      return
    }
    if (simKind === 'Unexpected expense' && simAmount > balance) {
      notify('This expense exceeds your available balance.')
      return
    }
    if (simKind === 'Cancel subscription') {
      const first = data.subscriptions[0]
      if (first) {
        setData(old => ({
          ...old,
          subscriptions: old.subscriptions.filter(x => x.id !== first.id),
        }))
      }
    } else {
      setData(old => ({
        ...old,
        transactions: [{
          id: uid(),
          title: simKind === 'Purchase' ? 'Simulated purchase' : 'Unexpected expense',
          category: simKind === 'Purchase' ? 'Shopping' : 'Unexpected',
          amount: simAmount,
          date: 'Today',
          type: 'expense',
        }, ...old.transactions],
      }))
    }
    setApplied(true)
    notify('Decision applied to your budget.')
  }

  function resetDemo() {
    setData(initialData)
    setApplied(false)
    notify('Demo data restored.')
  }

  const projected = balance - daily * daysLeft
  const categoryTotals = data.transactions
    .filter(t => t.type === 'expense')
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount
      return acc
    }, {})
  const categories = (Object.entries(categoryTotals) as [string, number][]).sort((a, b) => b[1] - a[1])
  const budgetCategories = [...new Set([...Object.keys(defaultCategoryLimits), ...Object.keys(categoryTotals)])].sort((a, b) => (categoryTotals[b] || 0) - (categoryTotals[a] || 0))
  const budgetAlerts: Array<{ name: string; actual: number; limit: number; forecast: number; level: 'exceeded' | 'forecast' | 'warning'; message: string }> = budgetCategories.reduce((alerts, name) => {
    const actual = categoryTotals[name] || 0
    const limit = Math.max(1, categoryLimits[name] || defaultCategoryLimits[name] || 500)
    const forecast = actual / Math.max(today, 1) * 30
    if (actual > limit) alerts.push({ name, actual, limit, forecast, level: 'exceeded', message: `Limit exceeded by ${money(actual - limit)}.` })
    else if (forecast > limit) alerts.push({ name, actual, limit, forecast, level: 'forecast', message: `At this pace, you may exceed the limit by ${money(forecast - limit)}.` })
    else if (actual >= limit * 0.8) alerts.push({ name, actual, limit, forecast, level: 'warning', message: `${Math.round(actual / limit * 100)}% of this category limit used.` })
    return alerts
  }, [] as Array<{ name: string; actual: number; limit: number; forecast: number; level: 'exceeded' | 'forecast' | 'warning'; message: string }>)
  const totalCategoryLimits = budgetCategories.reduce((sum, name) => sum + Math.max(0, categoryLimits[name] || 0), 0)
  const totalForecast = budgetCategories.reduce((sum, name) => sum + (categoryTotals[name] || 0) / Math.max(today, 1) * 30, 0)

  return (
    <div className={`pp-app min-h-screen bg-[#f7f8fc] text-[#182230] transition-colors duration-300 ${theme === 'dark' ? 'pp-dark' : ''}`}>
      <style>{`
        @keyframes pp-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pp-glow { 0%,100% { opacity: .35; transform: scale(1); } 50% { opacity: .6; transform: scale(1.08); } }
        @keyframes pp-progress { from { width: 0; } }
        .pp-reveal { animation: pp-rise .55s cubic-bezier(.2,.75,.25,1) both; }
        .pp-delay-1 { animation-delay: 70ms; } .pp-delay-2 { animation-delay: 140ms; } .pp-delay-3 { animation-delay: 210ms; } .pp-delay-4 { animation-delay: 280ms; }
        .pp-card { transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; }
        .pp-card:hover { transform: translateY(-3px); box-shadow: 0 16px 36px rgba(15,23,42,.07); border-color: #cbd5e1; }
        .pp-progress { animation: pp-progress .9s ease-out both; }
        .pp-orb { animation: pp-glow 7s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .pp-reveal, .pp-orb, .pp-progress { animation: none !important; } .pp-card { transition: none !important; } }
        .pp-dark { background: #0b1220 !important; color: #e5edf7 !important; color-scheme: dark; }
        .pp-dark .bg-white, .pp-dark .bg-white\/90 { background-color: #111c2e !important; }
        .pp-dark .bg-\[\#f7f8fc\], .pp-dark .bg-slate-50 { background-color: #0b1220 !important; }
        .pp-dark .bg-slate-100 { background-color: #1e293b !important; }
        .pp-dark .bg-\[\#f5f3ff\] { background-color: #211d3b !important; }
        .pp-dark .text-\[\#182230\], .pp-dark .text-slate-900, .pp-dark .text-slate-800, .pp-dark .text-slate-700 { color: #e5edf7 !important; }
        .pp-dark .text-slate-600, .pp-dark .text-slate-500 { color: #b0bfd2 !important; }
        .pp-dark .border-slate-100, .pp-dark .border-slate-200, .pp-dark .border-slate-200\/80 { border-color: #29384d !important; }
        .pp-dark input, .pp-dark select, .pp-dark textarea { background-color: #111c2e !important; color: #e5edf7 !important; border-color: #34445a !important; }
        .pp-dark option { background: #111c2e; color: #e5edf7; }
        .pp-dark .pp-card { border-color: #29384d !important; box-shadow: 0 8px 28px rgba(0,0,0,.16); }
        .pp-dark .pp-card:hover { border-color: #475569 !important; box-shadow: 0 16px 36px rgba(0,0,0,.28); }
        .pp-dark .hover\:bg-slate-50:hover { background-color: #1e293b !important; }
        .pp-dark .shadow-sm, .pp-dark .shadow-xl { --tw-shadow-color: rgba(0,0,0,.3); }

        /* PaisaPilot premium dark theme: consistently style every surface */
        .pp-dark { background: #070b14 !important; color: #edf3ff !important; }
        .pp-dark main { background: radial-gradient(ellipse at 78% 0%, rgba(16,185,129,.07), transparent 34%), #070b14 !important; }
        .pp-dark aside { background: linear-gradient(180deg,#0c1322 0%,#090f1b 100%) !important; border-color: #202c40 !important; box-shadow: 12px 0 40px rgba(0,0,0,.16); }
        .pp-dark header { background: rgba(10,16,29,.92) !important; border-color: #202c40 !important; box-shadow: 0 8px 30px rgba(0,0,0,.14); }
        .pp-dark .pp-card,
        .pp-dark main section,
        .pp-dark main article { background-color: #101a2b !important; border-color: #25344a !important; color: #edf3ff !important; }
        .pp-dark .pp-card { background-image: linear-gradient(145deg,rgba(24,38,59,.72),rgba(13,22,37,.96)); box-shadow: 0 12px 32px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.025); }
        .pp-dark .pp-card:hover { border-color: #3b536f !important; box-shadow: 0 18px 40px rgba(0,0,0,.32), 0 0 0 1px rgba(16,185,129,.06); }
        .pp-dark .bg-white, .pp-dark .bg-white\/90 { background-color: #101a2b !important; }
        .pp-dark .bg-\[\#f7f8fc\], .pp-dark .bg-slate-50 { background-color: #0b1423 !important; }
        .pp-dark .bg-slate-100 { background-color: #1a2940 !important; }
        .pp-dark .bg-\[\#f5f3ff\] { background: linear-gradient(145deg,#201b3b,#15182c) !important; }
        .pp-dark .text-\[\#182230\], .pp-dark .text-slate-900, .pp-dark .text-slate-800, .pp-dark .text-slate-700 { color: #edf3ff !important; }
        .pp-dark .text-slate-600, .pp-dark .text-slate-500 { color: #b5c3d8 !important; }
        .pp-dark .text-slate-400 { color: #8293ad !important; }
        .pp-dark .border-slate-100, .pp-dark .border-slate-200, .pp-dark .border-slate-200\/80 { border-color: #26364d !important; }
        .pp-dark input, .pp-dark select, .pp-dark textarea { background: #0b1423 !important; color: #edf3ff !important; border-color: #30415b !important; box-shadow: inset 0 1px 2px rgba(0,0,0,.15); }
        .pp-dark input::placeholder, .pp-dark textarea::placeholder { color: #71829d !important; }
        .pp-dark option { background: #101a2b; color: #edf3ff; }
        .pp-dark button:not([class*="bg-emerald-600"]):not([class*="bg-violet-600"]):not([class*="bg-rose-"]):not([class*="bg-amber-"]) { transition: background-color .2s ease,border-color .2s ease,color .2s ease,transform .2s ease; }
        .pp-dark .hover\:bg-slate-50:hover, .pp-dark .hover\:bg-slate-100:hover { background-color: #1b2940 !important; }
        .pp-dark aside nav button.text-emerald-700 { background: linear-gradient(100deg,rgba(16,185,129,.2),rgba(16,185,129,.08)) !important; color: #6ee7b7 !important; box-shadow: inset 3px 0 #34d399; }
        .pp-dark aside nav button.text-slate-500 { color: #a5b4ca !important; }
        .pp-dark aside nav button:hover { background-color: #17243a !important; color: #f1f5f9 !important; }
        .pp-dark .pp-theme-toggle { background: #152238 !important; color: #fbbf24 !important; border-color: #344863 !important; }
        .pp-dark .pp-theme-toggle:hover { background: #20314b !important; }
        .pp-dark .fixed.bottom-0 { background: rgba(10,16,29,.97) !important; border-color: #26364d !important; backdrop-filter: blur(18px); }
        .pp-dark .fixed.bottom-0 button { color: #8fa1ba; }
        .pp-dark .fixed.bottom-0 button.text-emerald-700 { color: #6ee7b7 !important; }
        .pp-dark .rounded-xl.bg-emerald-50, .pp-dark .bg-emerald-50 { background-color: #10332f !important; color: #a7f3d0 !important; }
        .pp-dark .bg-violet-100 { background-color: #2a2450 !important; }
        .pp-dark .text-violet-700, .pp-dark .text-violet-800 { color: #c4b5fd !important; }
        .pp-dark .bg-rose-50 { background-color: #3b1d2a !important; }
        .pp-dark .bg-amber-50, .pp-dark .bg-amber-50\/60 { background-color: #352a19 !important; }
        .pp-dark .border-rose-200 { border-color: #713449 !important; }
        .pp-dark .border-amber-200, .pp-dark .border-amber-100 { border-color: #66502d !important; }
        .pp-dark .text-rose-800 { color: #fda4af !important; }
        .pp-dark .text-amber-900 { color: #fcd34d !important; }
        .pp-dark .recharts-cartesian-grid line { stroke: #2a3a51 !important; }
        .pp-dark .recharts-text, .pp-dark .recharts-cartesian-axis-tick-value { fill: #91a2bb !important; }
        .pp-dark .recharts-tooltip-wrapper .recharts-default-tooltip { background: #101a2b !important; border: 1px solid #344863 !important; border-radius: 12px !important; box-shadow: 0 12px 30px rgba(0,0,0,.35) !important; }
        .pp-dark .recharts-tooltip-label, .pp-dark .recharts-tooltip-item { color: #edf3ff !important; }
        .pp-dark .pp-card svg:not([class*="text-emerald"]):not([class*="text-rose"]):not([class*="text-violet"]):not([class*="text-amber"]) { filter: saturate(1.15); }
        .pp-dark .shadow-sm, .pp-dark .shadow-xl { --tw-shadow-color: rgba(0,0,0,.4); }
        @media (prefers-reduced-motion: no-preference) {
          .pp-dark .pp-card { animation: pp-rise .38s ease both; }
          .pp-dark .pp-theme-toggle { box-shadow: 0 0 0 1px rgba(52,211,153,.08), 0 6px 20px rgba(0,0,0,.22); }
        }

        /* Final dark-theme pass: menus, popovers, dialogs, chat, forms and every nested panel */
        .pp-dark { background-color:#070b14 !important; color:#edf3ff !important; }
        .pp-dark .pp-app, .pp-dark main, .pp-dark main > div { color:#edf3ff; }
        .pp-dark [role="dialog"], .pp-dark [role="menu"], .pp-dark [role="listbox"],
        .pp-dark .fixed.inset-0 > form, .pp-dark .fixed.inset-0 form,
        .pp-dark .absolute.z-30, .pp-dark .absolute.right-0.top-12,
        .pp-dark .rounded-2xl.bg-white, .pp-dark .rounded-xl.bg-white {
          background-color:#111b2c !important; color:#edf3ff !important; border-color:#2b3b53 !important;
          box-shadow:0 22px 65px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.025);
        }
        .pp-dark .bg-white\/10 { background-color:rgba(255,255,255,.07) !important; }
        .pp-dark .bg-white\/90 { background-color:rgba(10,16,29,.94) !important; }
        .pp-dark .bg-violet-50 { background-color:#211d3b !important; }
        .pp-dark .bg-violet-100 { background-color:#2b2550 !important; }
        .pp-dark .bg-rose-100 { background-color:#40202e !important; }
        .pp-dark .bg-amber-100 { background-color:#3a2d19 !important; }
        .pp-dark .text-violet-700, .pp-dark .text-violet-800 { color:#c4b5fd !important; }
        .pp-dark .text-emerald-800 { color:#a7f3d0 !important; }
        .pp-dark .text-rose-600, .pp-dark .text-rose-700 { color:#fda4af !important; }
        .pp-dark .text-amber-700, .pp-dark .text-amber-800 { color:#fcd34d !important; }
        .pp-dark .text-slate-300 { color:#9aabc2 !important; }
        .pp-dark .border-dashed { border-color:#3a4c65 !important; }
        .pp-dark input, .pp-dark textarea, .pp-dark select {
          background:#0a1322 !important; color:#edf3ff !important; border-color:#344863 !important;
        }
        .pp-dark input:focus, .pp-dark textarea:focus, .pp-dark select:focus {
          border-color:#34d399 !important; box-shadow:0 0 0 3px rgba(52,211,153,.12) !important; outline:none;
        }
        .pp-dark input::placeholder, .pp-dark textarea::placeholder { color:#71839e !important; }
        .pp-dark label { color:#b9c7da; }
        .pp-dark .recharts-default-tooltip { background:#111b2c !important; border:1px solid #334660 !important; border-radius:14px !important; }
        .pp-dark .recharts-tooltip-item-list, .pp-dark .recharts-tooltip-item, .pp-dark .recharts-tooltip-label { color:#edf3ff !important; }
        .pp-dark .fixed.bottom-20, .pp-dark .fixed.bottom-6 { background:#101b2c !important; border:1px solid #2c4058; color:#edf3ff !important; }
        .pp-dark .pp-card .bg-slate-50, .pp-dark .pp-card .bg-slate-100 { background-color:#0b1423 !important; }
        .pp-dark .pp-card .border-slate-100, .pp-dark .pp-card .border-slate-200 { border-color:#2a3b53 !important; }
        .pp-dark button:focus-visible { outline:2px solid #34d399; outline-offset:2px; }
        .pp-dark .bg-emerald-600 { background-color:#059669 !important; }
        .pp-dark .bg-emerald-600:hover { background-color:#10b981 !important; }
        .pp-dark .pp-progress { filter:brightness(1.08); }

        /* High-contrast, colorful premium palette across all dark-mode screens */
        .pp-dark h1, .pp-dark h2, .pp-dark h3, .pp-dark h4 { color:#f3f7ff !important; letter-spacing:-.015em; }
        .pp-dark p { color:#b8c7dc; }
        .pp-dark small, .pp-dark .text-xs, .pp-dark .text-\[10px\], .pp-dark .text-\[11px\] { text-shadow:0 1px 0 rgba(0,0,0,.08); }
        .pp-dark .pp-card { position:relative; overflow:hidden; border-color:#263852 !important; }
        .pp-dark .pp-card:before { content:""; position:absolute; inset:0 auto 0 0; width:2px; background:linear-gradient(180deg,#34d399,#60a5fa,#a78bfa); opacity:.65; pointer-events:none; }
        .pp-dark .pp-card:hover { border-color:#42617f !important; box-shadow:0 18px 42px rgba(0,0,0,.34),0 0 24px rgba(56,189,248,.06) !important; }
        .pp-dark button, .pp-dark a, .pp-dark [role="button"] { transition:color .18s ease,background-color .18s ease,border-color .18s ease,box-shadow .18s ease,transform .18s ease; }
        .pp-dark button:hover:not(:disabled) { filter:brightness(1.08); }
        .pp-dark button svg, .pp-dark a svg { transition:transform .2s ease,filter .2s ease; }
        .pp-dark button:hover svg, .pp-dark a:hover svg { transform:scale(1.08); filter:drop-shadow(0 0 5px rgba(52,211,153,.28)); }
        .pp-dark aside .rounded-2xl.bg-emerald-500 { box-shadow:0 0 24px rgba(16,185,129,.24); }
        .pp-dark .bg-emerald-50 { background:rgba(16,185,129,.14) !important; color:#6ee7b7 !important; }
        .pp-dark .bg-violet-50, .pp-dark .bg-violet-100 { background:rgba(139,92,246,.16) !important; }
        .pp-dark .bg-amber-50, .pp-dark .bg-amber-100 { background:rgba(245,158,11,.14) !important; }
        .pp-dark .bg-rose-50, .pp-dark .bg-rose-100 { background:rgba(244,63,94,.14) !important; }
        .pp-dark .text-emerald-600, .pp-dark .text-emerald-700 { color:#4adeb1 !important; }
        .pp-dark .text-violet-600, .pp-dark .text-violet-700 { color:#c4b5fd !important; }
        .pp-dark .text-amber-600, .pp-dark .text-amber-700 { color:#fbbf24 !important; }
        .pp-dark .text-rose-600, .pp-dark .text-rose-700 { color:#fb7185 !important; }
        .pp-dark .text-blue-600, .pp-dark .text-sky-600 { color:#7dd3fc !important; }
        .pp-dark .pp-card .rounded-xl.p-2, .pp-dark .pp-card .rounded-xl.p-2\.5, .pp-dark .pp-card .rounded-xl.p-3 { box-shadow:inset 0 0 0 1px rgba(255,255,255,.035); }
        .pp-dark .recharts-cartesian-grid line { stroke:#2a3c56 !important; stroke-dasharray:4 5; }
        .pp-dark .recharts-cartesian-axis-line, .pp-dark .recharts-cartesian-axis-tick-line { stroke:#354761 !important; }
        .pp-dark .recharts-text, .pp-dark .recharts-cartesian-axis-tick-value { fill:#a9bad2 !important; }
        .pp-dark .recharts-tooltip-wrapper .recharts-default-tooltip { background:linear-gradient(145deg,#17253b,#0c1525) !important; border:1px solid #3a506d !important; color:#f1f5f9 !important; }
        .pp-dark .recharts-tooltip-item-name { color:#b8c7dc !important; }
        .pp-dark .recharts-tooltip-item-value { color:#6ee7b7 !important; font-weight:800; }
        .pp-dark input[type="range"] { accent-color:#34d399; }
        .pp-dark ::selection { background:rgba(52,211,153,.3); color:#fff; }
        .pp-dark .fixed.inset-0 > div, .pp-dark .fixed.inset-0 > form { backdrop-filter:blur(22px); }
        /* PaisaPilot dark-theme contrast fixes: rupee amounts and secondary surfaces */
        .pp-dark [class*="text-slate-900"],
        .pp-dark [class*="text-slate-800"],
        .pp-dark [class*="text-gray-900"],
        .pp-dark [class*="text-gray-800"] { color:#f1f5f9 !important; }
        .pp-dark [class*="text-slate-700"],
        .pp-dark [class*="text-slate-600"],
        .pp-dark [class*="text-gray-700"],
        .pp-dark [class*="text-gray-600"] { color:#c4d2e4 !important; }
        .pp-dark [class*="text-slate-500"],
        .pp-dark [class*="text-gray-500"] { color:#a7b8cf !important; }
        .pp-dark [class*="text-slate-400"],
        .pp-dark [class*="text-gray-400"] { color:#91a4be !important; }
        .pp-dark .bg-white,
        .pp-dark .bg-white\/90,
        .pp-dark .bg-slate-50,
        .pp-dark .bg-slate-100,
        .pp-dark .bg-gray-50,
        .pp-dark .bg-gray-100 { background-color:#142136 !important; }
        .pp-dark .border-slate-100,
        .pp-dark .border-slate-200,
        .pp-dark .border-slate-200\/80,
        .pp-dark .border-gray-100,
        .pp-dark .border-gray-200 { border-color:#2b3d57 !important; }
        .pp-dark .bg-slate-50 [class*="text-slate-900"],
        .pp-dark .bg-slate-100 [class*="text-slate-900"] { color:#f8fafc !important; }
        /* Currency values should never disappear into the dark background. */
        .pp-dark .font-black[class*="text-slate"],
        .pp-dark .font-extrabold[class*="text-slate"],
        .pp-dark .font-bold[class*="text-slate"],
        .pp-dark [class*="text-slate-800"].text-sm,
        .pp-dark [class*="text-slate-800"].text-xl,
        .pp-dark [class*="text-slate-800"].text-2xl,
        .pp-dark [class*="text-slate-900"].text-2xl,
        .pp-dark [class*="text-slate-900"].text-3xl { color:#f1f5f9 !important; }
        .pp-dark .text-emerald-600, .pp-dark .text-emerald-700 { color:#5eead4 !important; }
        .pp-dark .text-rose-600, .pp-dark .text-rose-700 { color:#fb7185 !important; }
        .pp-dark .text-violet-600, .pp-dark .text-violet-700 { color:#c4b5fd !important; }
        .pp-dark .text-amber-600, .pp-dark .text-amber-700 { color:#fcd34d !important; }
        /* Transaction summary tiles and rows use the same dark surface system. */
        .pp-dark .pp-card .bg-slate-50,
        .pp-dark .pp-card .bg-white,
        .pp-dark .pp-card .bg-slate-100 { background-color:#17263b !important; }
        .pp-dark .pp-card .bg-emerald-50 { background-color:rgba(16,185,129,.16) !important; }
        .pp-dark .pp-card .bg-rose-50 { background-color:rgba(244,63,94,.16) !important; }
        .pp-dark .pp-card .bg-violet-50 { background-color:rgba(139,92,246,.17) !important; }
        .pp-dark .pp-card .bg-amber-50 { background-color:rgba(245,158,11,.16) !important; }
        .pp-dark .recharts-pie-sector path { stroke:#142136 !important; }
        .pp-dark .recharts-tooltip-wrapper .recharts-default-tooltip,
        .pp-dark .recharts-default-tooltip { background-color:#142136 !important; }
        .pp-dark input:not([type="checkbox"]):not([type="range"]),
        .pp-dark select,
        .pp-dark textarea { background-color:#111c2e !important; color:#f1f5f9 !important; border-color:#344861 !important; }
        .pp-dark input::placeholder,
        .pp-dark textarea::placeholder { color:#8fa3bd !important; }
      `}</style>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-61 flex-col border-r border-slate-200 bg-white px-5 py-6 lg:flex" aria-label="Primary sidebar">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 text-white">
            <Wallet size={22} />
          </div>
          <div>
            <div className="text-lg font-extrabold tracking-tight">paisapilot<span className="text-emerald-500">.</span></div>
            <div className="text-xs text-slate-400">Your money, in motion</div>
          </div>
        </div>
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Workspace</div>
        <nav className="space-y-1" aria-label="Primary navigation">
          {nav.map(item => {
            const Icon = item.icon
            const active = page === item.name
            return (
              <button key={item.name} onClick={() => setPage(item.name)}
                aria-current={active ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${active ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <Icon size={18} /> {item.name}
                {item.name === 'Decision lab' && <span className="ml-auto rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">NEW</span>}
              </button>
            )
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-[#f5f3ff] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-violet-800"><Zap size={16}/> Small steps, big goals</div>
          <p className="text-xs leading-5 text-violet-700">Every rupee has a job. Make yours count.</p>
          <button onClick={() => setPage('Decision lab')} className="mt-3 w-full rounded-lg bg-violet-600 py-2 text-xs font-bold text-white hover:bg-violet-700">Try a scenario ↗</button>
        </div>
        <button onClick={resetDemo} className="mt-4 flex items-center gap-2 px-2 py-2 text-xs text-slate-400 hover:text-slate-700"><RefreshCw size={14}/> Reset demo data</button>
      </aside>

      <main id="main-content" tabIndex={-1} className="min-h-screen lg:ml-61">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-4 backdrop-blur-md sm:px-8">
          <div>
            <div className="text-xs text-slate-400">Personal finance / {page}</div>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">{page === 'Overview' ? 'Your financial overview' : page}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 pp-theme-toggle"><span className="flex items-center gap-2">{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}<span className="hidden text-xs font-bold sm:inline">{theme === 'dark' ? 'Light' : 'Dark'} mode</span></span></button>
            <div className="relative">
              <button aria-label="Open notifications" aria-expanded={showNotifications} onClick={() => setShowNotifications(v => !v)} className="relative rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"><Bell size={18}/>{budgetAlerts.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{budgetAlerts.length > 9 ? '9+' : budgetAlerts.length}</span>}</button>
              {showNotifications && <>
                <button aria-label="Close notifications" className="fixed inset-0 z-20 cursor-default" onClick={() => setShowNotifications(false)} />
                <div className="absolute right-0 top-12 z-30 w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between"><div><h3 className="font-extrabold">Notifications</h3><p className="text-xs text-slate-400">Budget and spending updates</p></div><button onClick={() => setShowNotifications(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16}/></button></div>
                  {budgetAlerts.length === 0 ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">You’re all caught up. No budget alerts right now.</p> : <div className="max-h-72 space-y-2 overflow-y-auto">{budgetAlerts.slice(0, 6).map(alert => <button key={alert.name} onClick={() => { setPage('Smart Budget'); setShowNotifications(false) }} className={`w-full rounded-xl border p-3 text-left ${alert.level === 'exceeded' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-center gap-2 text-sm font-bold"><AlertTriangle size={15} className={alert.level === 'exceeded' ? 'text-rose-600' : 'text-amber-600'}/>{alert.name} · {alert.level === 'exceeded' ? 'Limit exceeded' : alert.level === 'forecast' ? 'Forecast warning' : 'Near limit'}</div><p className="mt-1 text-xs leading-5 text-slate-600">{alert.message}</p></button>)}</div>}
                  {budgetAlerts.length > 0 && <button onClick={() => { setPage('Smart Budget'); setShowNotifications(false) }} className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">View Smart Budget</button>}
                </div>
              </>}
            </div>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white shadow-sm shadow-emerald-200 hover:bg-emerald-700 sm:px-4"><Plus size={17}/> <span className="hidden sm:inline">Add transaction</span><span className="sm:hidden">Add</span></button>
          </div>
        </header>

        <div className="mx-auto max-w-375 space-y-6 p-4 sm:p-8">
          {page === 'Overview' && <>
            <div className="pp-reveal flex flex-wrap items-center justify-between gap-3">
              <div><div className="text-sm font-semibold text-slate-500">Your October money plan</div><div className="mt-1 text-xs text-slate-400">A 30-day budget built around your priorities.</div></div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm"><CalendarDays size={15} className="text-emerald-600"/> Oct 1 – Oct 30 <ChevronDown size={14}/></div>
            </div>

            <section className="pp-reveal pp-delay-1 relative isolate overflow-hidden rounded-[28px] bg-linear-to-br from-[#062e2a] via-[#075e54] to-[#0f766e] p-6 text-white shadow-xl shadow-emerald-950/10 sm:p-8">
              <div className="pp-orb pointer-events-none absolute -right-10 -top-20 -z-10 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl"/>
              <div className="pointer-events-none absolute -bottom-28 right-1/4 -z-10 h-56 w-56 rounded-full bg-teal-300/10 blur-3xl"/>
              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="max-w-xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold tracking-wide text-emerald-50"><Sparkles size={13}/> YOUR MONEY, IN MOTION</div>
                  <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Make every rupee <span className="text-emerald-200">count.</span></h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-emerald-50/80">A clearer view of your money today, and a calmer plan for what comes next.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:min-w-72">
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm"><div className="text-[11px] font-medium text-emerald-100/80">Money remaining</div><div className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">{money(balance)}</div><div className="mt-1 text-[10px] text-emerald-100/70">After recorded spending</div></div>
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm"><div className="text-[11px] font-medium text-emerald-100/80">Safe per day</div><div className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">{money(daily)}</div><div className="mt-1 text-[10px] text-emerald-100/70">{daysLeft} days left in plan</div></div>
                </div>
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-white/15 pt-4 text-xs text-emerald-50/80"><span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${risk === 'Low' ? 'bg-emerald-300' : risk === 'Moderate' ? 'bg-amber-300' : 'bg-rose-300'}`}/>{risk} budget risk</span><span className="text-white/30">•</span><span>{Math.round(spent / Math.max(income, 1) * 100)}% of recorded income spent</span><button onClick={() => setPage('Spending Coach')} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 font-bold text-emerald-900 transition hover:bg-emerald-50">Ask Spending Coach <Sparkles size={14}/></button></div>
            </section>

            <section className="pp-reveal pp-delay-2 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric title="Available balance" value={money(balance)} icon={Wallet} color="emerald" sub="Across this budget cycle" />
              <Metric title="Total spent" value={money(spent - 0)} icon={ArrowUpRight} color="rose" sub={`${Math.round(spent / Math.max(income, 1) * 100)}% of income used`} />
              <Metric title="Daily safe-to-spend" value={money(daily)} icon={Gauge} color="violet" sub={`${daysLeft} days remaining`} />
              <Metric title="Financial health" value={`${score}/100`} icon={ShieldCheck} color="amber" sub={`${risk} risk · demo estimate`} />
            </section>

            <section className="pp-reveal pp-delay-3 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
              <div className="pp-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/2 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="font-bold">Balance forecast</h2><p className="mt-1 text-xs text-slate-400">Your current balance and projected runway</p></div>
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><TrendingUp className="mr-1 inline" size={14}/> 30-day view</div>
                </div>
                <div className="mt-6 h-65 w-full">
                  <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400" role="status">Loading balance chart…</div>}>
                    <div role="img" aria-label="Projected account balance over the next 30 days" className="h-full w-full">
                      <BalanceForecastChart chartData={chartData} money={money} />
                    </div>
                  </Suspense>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs"><span className="text-slate-500">Projected month-end balance</span><span className="font-extrabold text-slate-800">{money(projected)}</span></div>
              </div>

              <div className="pp-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/2 sm:p-6">
                <div className="flex items-center justify-between"><div><h2 className="font-bold">Budget breakdown</h2><p className="mt-1 text-xs text-slate-400">Where your money goes</p></div><Activity size={19} className="text-slate-400"/></div>
                <div className="my-6 flex items-center gap-5">
                  <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full" style={{background:`conic-gradient(#10b981 ${Math.min(100, spent/10000*100)}%, #eaf0f3 0)`}}>
                    <div className="flex h-20.5 w-20.5 flex-col items-center justify-center rounded-full bg-white"><span className="text-xl font-extrabold">{Math.round(spent/10000*100)}%</span><span className="text-[10px] text-slate-400">used</span></div>
                  </div>
                  <div><div className="text-xs text-slate-400">Spent so far</div><div className="mt-1 text-2xl font-extrabold">{money(spent)}</div><div className="mt-1 text-xs text-emerald-600">{money(balance)} remaining</div></div>
                </div>
                <div className="space-y-4">
                  {categories.slice(0, 5).map(([name, value], i) => {
                    const colors = ['#10b981','#8b7cf6','#f59e0b','#f472b6','#38bdf8']
                    return <div key={name}><div className="mb-1.5 flex justify-between text-xs"><span className="font-semibold text-slate-600">{name}</span><span className="font-bold">{money(value)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="pp-progress h-full rounded-full" style={{width:`${Math.min(100, value/Math.max(spent,1)*100)}%`,background:colors[i%colors.length],animationDelay:`${i*90}ms`}}/></div></div>
                  })}
                </div>
              </div>
            </section>

            <section className="pp-reveal grid gap-5 xl:grid-cols-[1.4fr_1fr]">
              <div className="pp-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/2 sm:p-6">
                <div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">Recent transactions</h2><p className="mt-1 text-xs text-slate-400">Your latest money moves</p></div><button onClick={() => setPage('Transactions')} className="text-xs font-bold text-emerald-700 hover:text-emerald-900">View all ↗</button></div>
                <div className="space-y-4">
                  {data.transactions.slice(0, 5).map(t => <TransactionRow key={t.id} tx={t} onDelete={() => setData(old => ({...old, transactions:old.transactions.filter(x=>x.id!==t.id)}))}/>)}
                </div>
              </div>
              <div className="pp-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/2 sm:p-6">
                <div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">Your savings goals</h2><p className="mt-1 text-xs text-slate-400">Little by little adds up</p></div><button onClick={() => setPage('Savings goals')} className="text-xs font-bold text-emerald-700">See all ↗</button></div>
                <div className="space-y-5">{data.goals.slice(0,3).map(g => <GoalRow key={g.id} goal={g}/>)}</div>
                <button onClick={() => {setPage('Savings goals');setNewGoal(true)}} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-xs font-bold text-slate-500 hover:border-emerald-400 hover:text-emerald-700"><Plus size={15}/> Create a savings goal</button>
              </div>
            </section>

            <section className="pp-reveal pp-delay-2 grid gap-4 md:grid-cols-3">
              <Insight icon={ShieldCheck} title="Protect your essentials" text={`${money(bills)} in listed subscriptions should be accounted for before discretionary spending.`} tone="green"/>
              <Insight icon={TrendingDown} title="Know your runway" text={`Your simple post-reserve allowance is ${money(daily)} per remaining day.`} tone="violet"/>
              <Insight icon={Target} title="Keep goals visible" text={`${money(savings)} saved across ${data.goals.length} goals. Track progress before making a big purchase.`} tone="amber"/>
            </section>
          </>}

          {page === 'Smart Budget' && <section className="space-y-5">
            <div className="pp-reveal flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><div className="flex items-center gap-2 text-sm font-bold text-emerald-700"><SlidersHorizontal size={16}/> BUDGET CONTROL CENTER</div><h2 className="mt-2 text-2xl font-black tracking-tight">Smart Budget & Alerts</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Set category limits, spot overspending early, and see a simple month-end forecast based on your recorded transactions.</p></div>
              <button onClick={() => { setCategoryLimits(defaultCategoryLimits); notify('Category limits reset to defaults.') }} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"><RefreshCw size={15} className="mr-2 inline"/>Reset limits</button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric title="Category limits" value={money(totalCategoryLimits)} icon={SlidersHorizontal} color="emerald" sub="Combined limits across categories"/>
              <Metric title="Recorded expenses" value={money(spent)} icon={ArrowUpRight} color="rose" sub="Based on saved transactions"/>
              <Metric title="Projected month spend" value={money(totalForecast)} icon={TrendingUp} color="violet" sub="Current pace × 30 days"/>
              <Metric title="Active alerts" value={String(budgetAlerts.length)} icon={AlertTriangle} color={budgetAlerts.length ? 'amber' : 'emerald'} sub="Warnings and projected overruns"/>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
              <div className="pp-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="font-extrabold">Category limits</h3><p className="mt-1 text-xs leading-5 text-slate-400">Edit any amount. Changes save automatically in this browser.</p></div><span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Wallet size={19}/></span></div>
                <div className="space-y-5">
                  {budgetCategories.map((name, index) => {
                    const actual = categoryTotals[name] || 0
                    const limit = Math.max(1, categoryLimits[name] || 500)
                    const pct = actual / limit * 100
                    const forecast = actual / Math.max(today, 1) * 30
                    const exceeded = actual > limit
                    const forecastRisk = !exceeded && forecast > limit
                    const barColor = exceeded ? 'bg-rose-500' : forecastRisk || pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
                    return <div key={name} className="pp-reveal" style={{animationDelay: `${index * 45}ms`}}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-bold text-slate-700">{name}<div className="mt-0.5 text-[11px] font-normal text-slate-400">Spent {money(actual)} · Forecast {money(forecast)}</div></div><div className="flex items-center gap-2"><label className="text-[11px] text-slate-400" htmlFor={`limit-${name}`}>Limit ₹</label><input id={`limit-${name}`} type="number" min="0" step="100" value={categoryLimits[name] ?? 500} onChange={e => setCategoryLimits(old => ({ ...old, [name]: Math.max(0, Number(e.target.value)) }))} className="w-28 rounded-lg border border-slate-200 px-2.5 py-2 text-right text-sm font-bold outline-none focus:border-emerald-500"/></div></div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`pp-progress h-full rounded-full transition-all duration-700 ${barColor}`} style={{width: `${Math.min(100, pct)}%`}}/></div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400"><span>{Math.round(pct)}% used</span><span>{money(Math.max(0, limit - actual))} remaining</span></div>
                    </div>
                  })}
                </div>
              </div>

              <div className="space-y-5">
                <div className="pp-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-start gap-3"><div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><TrendingUp size={19}/></div><div><h3 className="font-extrabold">Month-end forecast</h3><p className="mt-1 text-xs leading-5 text-slate-400">Linear estimate from the first {today} days of this demo budget.</p></div></div>
                  <div className="mt-5 rounded-2xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Projected total spending</div><div className="mt-1 text-2xl font-black tracking-tight">{money(totalForecast)}</div><div className={`mt-2 text-xs font-semibold ${totalForecast > totalCategoryLimits ? 'text-rose-600' : 'text-emerald-700'}`}>{totalForecast > totalCategoryLimits ? `${money(totalForecast - totalCategoryLimits)} above combined limits` : `${money(totalCategoryLimits - totalForecast)} below combined limits`}</div></div>
                  <div className="mt-4 space-y-3">{budgetCategories.slice(0, 5).map(name => { const forecast = (categoryTotals[name] || 0) / Math.max(today, 1) * 30; const limit = categoryLimits[name] || 500; const risky = forecast > limit; return <div key={name} className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-600">{name}</span><span className={`font-bold ${risky ? 'text-rose-600' : 'text-slate-700'}`}>{money(forecast)} <span className="font-normal text-slate-400">/ {money(limit)}</span></span></div> })}</div>
                </div>

                <div className="pp-card rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-2"><div><h3 className="font-extrabold">Budget alerts</h3><p className="mt-1 text-xs text-slate-400">Updates when transactions or limits change.</p></div><Bell size={18} className="text-slate-400"/></div>
                  {budgetAlerts.length === 0 ? <div className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-800"><Check size={17} className="mr-2 inline"/>All categories look within their limits at the moment.</div> : <div className="space-y-3">{budgetAlerts.map(alert => <div key={alert.name} className={`rounded-xl border p-3 ${alert.level === 'exceeded' ? 'border-rose-200 bg-rose-50' : alert.level === 'forecast' ? 'border-amber-200 bg-amber-50' : 'border-amber-100 bg-amber-50/60'}`}><div className="flex items-start gap-2"><AlertTriangle size={16} className={`mt-0.5 shrink-0 ${alert.level === 'exceeded' ? 'text-rose-600' : 'text-amber-600'}`}/><div className="min-w-0"><div className={`text-sm font-bold ${alert.level === 'exceeded' ? 'text-rose-800' : 'text-amber-900'}`}>{alert.name} · {alert.level === 'exceeded' ? 'Limit exceeded' : alert.level === 'forecast' ? 'Forecast warning' : 'Near limit'}</div><p className="mt-1 text-xs leading-5 text-slate-600">{alert.message}</p></div></div></div>)}</div>}
                  <p className="mt-4 text-[10px] leading-5 text-slate-400">Forecasts are simple estimates, not guarantees. They use recorded expenses and the demo's fixed day counter.</p>
                </div>
              </div>
            </div>
          </section>}

          {page === 'Transactions' && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">All transactions</h2><p className="mt-1 text-sm text-slate-400">Add and review your income and expenses.</p></div><button onClick={() => setShowAdd(true)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} className="mr-1 inline"/> Add</button></div>
            <div className="mb-6 grid gap-3 sm:grid-cols-3"><MiniStat title="Income" amount={money(income)} color="text-emerald-600"/><MiniStat title="Expenses" amount={money(spent)} color="text-rose-600"/><MiniStat title="Net balance" amount={money(balance)} color="text-slate-800"/></div>
            <div className="space-y-2">{data.transactions.map(t => <TransactionRow key={t.id} tx={t} onDelete={() => setData(old => ({...old,transactions:old.transactions.filter(x=>x.id!==t.id)}))}/>)}</div>
          </section>}

          {page === 'Decision lab' && <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
              <div className="mb-6 flex items-center gap-3"><div className="rounded-xl bg-violet-100 p-3 text-violet-700"><Zap size={22}/></div><div><h2 className="font-bold">What-if simulator</h2><p className="text-xs text-slate-400">Try it before you buy it.</p></div></div>
              <label className="mb-2 block text-sm font-semibold">What do you want to simulate?</label>
              <select value={simKind} onChange={e=>{setSimKind(e.target.value);setApplied(false)}} className="mb-5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400">
                <option>Purchase</option><option>Unexpected expense</option><option>Cancel subscription</option>
              </select>
              {simKind !== 'Cancel subscription' && <>
                <div className="mb-2 flex justify-between text-sm"><label className="font-semibold">Amount</label><span className="font-extrabold text-violet-700">{money(simAmount)}</span></div>
                <input aria-label="Simulation amount" type="range" min="100" max="5000" step="100" value={simAmount} onChange={e=>{setSimAmount(Number(e.target.value));setApplied(false)}} className="w-full accent-violet-600"/>
                <div className="mt-1 flex justify-between text-xs text-slate-400"><span>₹100</span><span>₹5,000</span></div>
                <div className="mt-4"><label className="mb-2 block text-xs text-slate-500">Or enter exact amount</label><input type="number" min="1" value={simAmount} onChange={e=>{setSimAmount(Math.max(0,Number(e.target.value)));setApplied(false)}} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"/></div>
              </>}
              <div className="mt-6 rounded-xl bg-violet-50 p-4 text-sm leading-6 text-violet-900">{simKind === 'Cancel subscription' ? `Cancel ${data.subscriptions[0]?.name ?? 'a subscription'} to free up ${money(data.subscriptions[0]?.amount ?? 0)} per cycle.` : `This ${simKind.toLowerCase()} will reduce your balance by ${money(simAmount)} and reduce your available daily allowance.`}</div>
              <button disabled={applied} onClick={applySimulation} className="mt-5 w-full rounded-xl bg-violet-600 py-3.5 text-sm font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{applied ? 'Decision applied ✓' : 'Apply this decision'}</button>
              <p className="mt-3 text-center text-xs text-slate-400">Applying changes your demo budget. You can reset it from the sidebar.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
              <h2 className="font-bold">Financial impact</h2><p className="mt-1 text-xs text-slate-400">Compare your position before and after.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <Compare title="Current balance" before={money(balance)} after={money(Math.max(0, balance - (simKind === 'Cancel subscription' ? 0 : simAmount)))}/>
                <Compare title="Daily allowance" before={money(daily)} after={money(Math.max(0, balance - (simKind === 'Cancel subscription' ? 0 : simAmount) - bills) / daysLeft)}/>
                <Compare title="Budget used" before={`${Math.round(spent/10000*100)}%`} after={`${Math.round((spent + (simKind === 'Cancel subscription' ? 0 : simAmount))/10000*100)}%`}/>
                <Compare title="Savings goals" before={money(savings)} after={money(savings)}/>
              </div>
              <div className="mt-6 rounded-xl border border-slate-100 p-4"><div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={17} className="text-emerald-600"/> Decision guidance</div><p className="mt-2 text-sm leading-6 text-slate-500">{simKind === 'Cancel subscription' ? 'Review whether you use this service regularly. Canceling can free up cash for other priorities.' : simAmount > daily * 5 ? 'This purchase costs more than five days of your current allowance. Consider waiting or choosing a lower-cost alternative.' : 'This expense may fit your budget, but check upcoming commitments and savings deadlines before deciding.'}</p></div>
            </div>
          </section>}

          {page === 'Savings goals' && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Your goals, your future</h2><p className="mt-1 text-sm text-slate-400">Make progress on what matters to you.</p></div><button onClick={() => setNewGoal(true)} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white"><Plus size={16} className="mr-1 inline"/> New goal</button></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.goals.map(g=><div key={g.id} className="rounded-2xl border border-slate-200 p-5"><div className="mb-4 flex items-center justify-between"><div className="rounded-xl bg-slate-50 p-3" style={{color:g.color}}><Target size={21}/></div><button onClick={()=>setData(old=>({...old,goals:old.goals.filter(x=>x.id!==g.id)}))} className="text-xs text-slate-400 hover:text-rose-600">Remove</button></div><h3 className="font-bold">{g.name}</h3><div className="mt-2 text-2xl font-extrabold">{money(g.saved)} <span className="text-sm font-medium text-slate-400">of {money(g.target)}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{width:`${Math.min(100,g.saved/g.target*100)}%`,background:g.color}}/></div><div className="mt-2 flex justify-between text-xs text-slate-400"><span>{Math.round(g.saved/g.target*100)}% complete</span><span>{money(Math.max(0,g.target-g.saved))} to go</span></div><button onClick={()=>{const v=window.prompt(`How much would you like to add to ${g.name}?`,'100');const n=Number(v);if(v!==null&&Number.isFinite(n)&&n>0&&n<=balance){setData(old=>({...old,goals:old.goals.map(x=>x.id===g.id?{...x,saved:Math.min(x.target,x.saved+n)}:x)}));notify('Goal contribution saved.')}}} className="mt-5 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-bold hover:border-emerald-500 hover:text-emerald-700">Add savings</button></div>)}</div>
          </section>}

          {page === 'Commitments' && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <div className="mb-6"><h2 className="font-bold">Recurring commitments</h2><p className="mt-1 text-sm text-slate-400">Subscriptions to account for before spending.</p></div>
            <div className="mb-5 rounded-2xl bg-emerald-50 p-5"><div className="text-sm text-emerald-800">Total recurring monthly costs</div><div className="mt-1 text-3xl font-extrabold text-emerald-900">{money(bills)}</div><div className="mt-2 text-xs text-emerald-700">Reserved against your available balance for planning.</div></div>
            <div className="space-y-3">{data.subscriptions.map(s=><div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-4"><div className="rounded-xl bg-slate-50 p-3 text-slate-600"><CreditCard size={20}/></div><div className="min-w-0 flex-1"><div className="font-semibold">{s.name}</div><div className="mt-1 text-xs text-slate-400">Due on day {s.due}</div></div><div className="font-extrabold">{money(s.amount)}</div><button onClick={()=>setData(old=>({...old,subscriptions:old.subscriptions.filter(x=>x.id!==s.id)}))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Cancel subscription"><X size={16}/></button></div>)}</div>
            {data.subscriptions.length===0&&<p className="py-8 text-center text-sm text-slate-400">No recurring subscriptions. Your budget is free of listed commitments.</p>}
          </section>}

          
{page === 'Spending Coach' && (
  <section className="space-y-5">
    <div className="rounded-2xl bg-linear-to-br from-emerald-700 to-teal-600 p-6 text-white sm:p-8">
      <div className="flex items-center gap-3">
        <Sparkles size={28} />
        <div>
          <h2 className="text-2xl font-extrabold">
            Spend smarter, not harder.
          </h2>
          <p className="mt-2 text-sm text-emerald-50">
            Get explainable suggestions based on your budget.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white/10 p-3">
          <p className="text-xs text-emerald-100">Current balance</p>
          <p className="mt-1 text-xl font-bold">{money(balance)}</p>
        </div>
        <div className="rounded-xl bg-white/10 p-3">
          <p className="text-xs text-emerald-100">Daily allowance</p>
          <p className="mt-1 text-xl font-bold">{money(daily)}</p>
        </div>
        <div className="col-span-2 rounded-xl bg-white/10 p-3 sm:col-span-1">
          <p className="text-xs text-emerald-100">Budget risk</p>
          <p className="mt-1 text-xl font-bold">{risk}</p>
        </div>
      </div>
    </div>

    <div className="pp-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/2 sm:p-6">
      <h3 className="font-bold">What would you like help with?</h3>
      <p className="mt-1 text-sm text-slate-500">
        Choose a prompt or type your own question.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          'Can I afford ₹1500?',
          'What if I spend ₹2000?',
          'How can I save money?',
          'Review my subscriptions',
          'Help me reach my savings goal',
        ].map(prompt => (
          <button
            key={prompt}
            type="button"
            onClick={() => {
              setCoachQuestion(prompt)
              askCoach(prompt)
            }}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:border-emerald-500 hover:bg-emerald-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <form
        className="mt-5 flex gap-2"
        onSubmit={e => {
          e.preventDefault()
          askCoach()
        }}
      >
        <input
          required
          value={coachQuestion}
          onChange={e => setCoachQuestion(e.target.value)}
          placeholder="e.g. Can I afford ₹2500 headphones?"
          aria-label="Ask the spending coach"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
        >
          <Send size={17} />
          Ask
        </button>
      </form>
    </div>

    {coachReply && (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
            <ShieldCheck size={23} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Spending analysis
            </p>
            <h3 className="mt-1 text-lg font-extrabold">
              {coachReply.title}
            </h3>
            <span className="mt-3 inline-block rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold">
              {coachReply.verdict}
            </span>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              {coachReply.explanation}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-slate-50 p-4">
          <h4 className="flex items-center gap-2 text-sm font-bold">
            <Target size={17} className="text-emerald-600" />
            Recommended next steps
          </h4>
          <ul className="mt-3 space-y-3">
            {coachReply.actions.map(action => (
              <li key={action} className="flex items-start gap-2 text-sm text-slate-600">
                <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                {action}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-400">
          This is a rule-based estimate using your recorded demo data,
          not professional financial advice.
        </p>
      </div>
    )}
  </section>
)}

          <footer className="flex flex-wrap items-center justify-between gap-3 pb-4 text-xs text-slate-400"><span>© 2026 PaisaPilot · Built for smarter money habits</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500"/> Demo mode · Stored in this browser</span></footer>
        </div>
      </main>

      <nav aria-label="Mobile navigation" className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-7 border-t border-slate-200 bg-white px-1 py-2 lg:hidden">
        {nav.map(item=>{const Icon=item.icon;return <button key={item.name} aria-current={page===item.name ? 'page' : undefined} onClick={()=>setPage(item.name)} className={`flex min-w-0 flex-col items-center gap-1 py-1 text-[9px] font-semibold ${page===item.name?'text-emerald-700':'text-slate-400'}`}><Icon size={19}/><span className="max-w-full truncate">{item.name==='Decision lab'?'Simulator':item.name==='Savings goals'?'Goals':item.name==='Commitments'?'Bills':item.name==='Smart Budget'?'Budget':item.name}</span></button>})}
      </nav>

      {showAdd&&<div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}><form onSubmit={e=>{e.preventDefault();addTransaction()}} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Add transaction</h2><p className="mt-1 text-xs text-slate-400">Keep your budget up to date.</p></div><button type="button" onClick={()=>setShowAdd(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={18}/></button></div>
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1"><button type="button" onClick={()=>setType('expense')} className={`rounded-lg py-2.5 text-sm font-bold ${type==='expense'?'bg-white text-rose-600 shadow-sm':'text-slate-500'}`}>Expense</button><button type="button" onClick={()=>setType('income')} className={`rounded-lg py-2.5 text-sm font-bold ${type==='income'?'bg-white text-emerald-700 shadow-sm':'text-slate-500'}`}>Income</button></div>
        <label className="mb-1.5 block text-xs font-bold text-slate-600">Description</label><input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Lunch, freelance payment" className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"/>
        <label className="mb-1.5 block text-xs font-bold text-slate-600">Amount (₹)</label><input required type="number" min="1" value={amount} onChange={e=>setAmount(e.target.value)} className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"/>
        <label className="mb-1.5 block text-xs font-bold text-slate-600">Category</label><select value={category} onChange={e=>setCategory(e.target.value)} className="mb-6 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500">{['Food','Travel','Essentials','Lifestyle','Bills','Education','Shopping','Income','Unexpected','Other'].map(c=><option key={c}>{c}</option>)}</select>
        <button type="submit" className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white hover:bg-emerald-700">Save transaction</button>
      </form></div>}

      {newGoal&&<div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4" onClick={e=>{if(e.target===e.currentTarget)setNewGoal(false)}}><form onSubmit={e=>{e.preventDefault();const n=Number(goalTarget);if(goalName.trim()&&n>0){setData(old=>({...old,goals:[...old.goals,{id:uid(),name:goalName.trim(),target:n,saved:0,color:'#0d9488'}]}));setGoalName('');setGoalTarget('2000');setNewGoal(false);notify('Savings goal created.')}else notify('Enter a name and valid target.')}} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-extrabold">Create a goal</h2><button type="button" onClick={()=>setNewGoal(false)}><X size={18}/></button></div><label className="mb-1 block text-xs font-bold">Goal name</label><input required value={goalName} onChange={e=>setGoalName(e.target.value)} placeholder="e.g. New laptop" className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"/><label className="mb-1 block text-xs font-bold">Target amount (₹)</label><input required type="number" min="1" value={goalTarget} onChange={e=>setGoalTarget(e.target.value)} className="mb-5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"/><button type="submit" className="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white">Create goal</button></form></div>}

      {toast&&<div role="status" className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl lg:bottom-6"><Check size={17} className="text-emerald-400"/>{toast}</div>}
    </div>
  )
}

function Metric({title,value,icon:Icon,color,sub}:{title:string;value:string;icon:typeof Wallet;color:string;sub:string}) {
  const tones:Record<string,string>={emerald:'bg-emerald-50 text-emerald-700',rose:'bg-rose-50 text-rose-600',violet:'bg-violet-50 text-violet-700',amber:'bg-amber-50 text-amber-700'}
  return <div className="pp-card pp-reveal group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/2"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">{title}</span><span className={`rounded-xl p-2.5 transition duration-300 group-hover:rotate-3 group-hover:scale-105 ${tones[color]}`}><Icon size={19}/></span></div><div className="mt-4 wrap-break-word text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{value}</div><div className="mt-2 text-[11px] leading-5 text-slate-400">{sub}</div><div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color==='rose'?'bg-rose-400':color==='violet'?'bg-violet-400':color==='amber'?'bg-amber-400':'bg-emerald-400'}`} style={{width:title==='Total spent'?`${Math.min(100, Number.parseFloat(sub)||0)}%`:title==='Financial health'?`${Math.min(100, Number.parseFloat(value)||0)}%`:title==='Daily safe-to-spend'?'68%':'82%'}}/></div></div>
}

function TransactionRow({tx,onDelete}:{tx:Tx;onDelete:()=>void}) {
  const positive=tx.type==='income'
  const icons:Record<string,typeof ShoppingBag>={Income:TrendingUp,Food:ShoppingBag,Travel:ArrowUpRight,Essentials:Wallet,Bills:CreditCard,Education:Target,Lifestyle:Activity,Shopping:ShoppingBag,Unexpected:Zap}
  const Icon=icons[tx.category]||CircleDollarSign
  return <div className="group flex items-center gap-3 rounded-xl py-2"><div className={`rounded-xl p-3 ${positive?'bg-emerald-50 text-emerald-600':'bg-slate-50 text-slate-600'}`}><Icon size={18}/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{tx.title}</div><div className="mt-1 text-[11px] text-slate-400">{tx.category} · {tx.date}</div></div><div className={`text-sm font-extrabold ${positive?'text-emerald-600':'text-slate-800'}`}>{positive?'+':'−'}{money(tx.amount)}</div><button onClick={onDelete} title="Delete transaction" className="ml-1 rounded-lg p-2 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100"><X size={15}/></button></div>
}

function GoalRow({goal}:{goal:Goal}) {
  const pct=Math.min(100,goal.saved/goal.target*100)
  return <div><div className="mb-2 flex items-center justify-between gap-2"><div className="truncate text-sm font-semibold">{goal.name}</div><div className="text-xs font-bold text-slate-700">{Math.round(pct)}%</div></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:goal.color}}/></div><div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>{money(goal.saved)} saved</span><span>{money(goal.target)} target</span></div></div>
}

function Insight({icon:Icon,title,text,tone}:{icon:typeof Wallet;title:string;text:string;tone:string}) {
  const colors:Record<string,string>={green:'bg-emerald-50 text-emerald-700',violet:'bg-violet-50 text-violet-700',amber:'bg-amber-50 text-amber-700'}
  return <div className="pp-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/2"><div className={`mb-3 inline-flex rounded-xl p-2.5 ${colors[tone]}`}><Icon size={19}/></div><h3 className="text-sm font-bold">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p></div>
}

function MiniStat({title,amount,color}:{title:string;amount:string;color:string}) {
  return <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-400">{title}</div><div className={`mt-2 text-xl font-extrabold ${color}`}>{amount}</div></div>
}

function Compare({title,before,after}:{title:string;before:string;after:string}) {
  return <div className="rounded-xl border border-slate-100 p-4"><div className="text-xs text-slate-400">{title}</div><div className="mt-3 grid grid-cols-2 gap-2"><div><div className="text-[10px] text-slate-400">Before</div><div className="mt-1 text-sm font-bold">{before}</div></div><div><div className="text-[10px] text-slate-400">After</div><div className="mt-1 text-sm font-bold text-violet-700">{after}</div></div></div></div>
}
