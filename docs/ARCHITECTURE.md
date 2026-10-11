# Architecture and engineering notes

## Application boundaries

PaisaPilot currently uses a small client-side architecture:

- `src/main.tsx` mounts the React application.
- `src/App.tsx` owns page selection, form state, demo finance state, derived totals, local persistence, and page-level UI.
- `src/components/BalanceForecastChart.tsx` renders the forecast visualization and is loaded with `React.lazy`/`Suspense` to keep chart code out of the initial synchronous component path.
- `src/components/BalanceChart.tsx` contains a reusable balance-area chart.
- `src/index.css` defines the global baseline, Tailwind import, keyboard focus treatment, and skip-link behavior.
- `src/App.css` contains app-specific transitions and reduced-motion overrides.

## Data flow

1. `initialData` provides illustrative transactions, savings goals, and subscriptions.
2. `loadData()` reads local storage and validates the shape before accepting saved data.
3. React state is the in-memory source of truth for interactions.
4. Derived values such as income, expenses, category totals, and alerts are calculated from current state.
5. Effects persist changes to local storage through best-effort writes. If storage is unavailable, the current session continues to work.
6. The forecast and coach are estimates derived from demo data and simple local rules.

## Design decisions

- **TypeScript:** shared data structures are explicitly typed.
- **Derived values:** summaries are computed from transaction state instead of separately stored totals, reducing stale duplicated state.
- **Lazy chart loading:** the forecast chart is dynamically imported and displays a status while loading.
- **Storage resilience:** reading malformed JSON or writing to unavailable/full storage should not crash the app.
- **Reduced motion:** decorative animation is disabled when `prefers-reduced-motion: reduce` is active.
- **Keyboard support:** a skip link, landmarks, active-page semantics, and `:focus-visible` styles improve navigation.

## Known limitations and next steps

- All information is demo/local data. There is no server, login, multi-device sync, or bank integration.
- The coach is rule-based, not an LLM or financial professional.
- The current forecast and health/risk indicators are simplified educational estimates, not guaranteed predictions.
- Date handling and sample transactions are intentionally lightweight; a production finance tool should use real transaction dates, explicit currency handling, time-zone-safe date utilities, and testable finance-domain functions.
- The main application component is large. A next refactor should extract the finance calculations into pure functions, then move each major page and reusable form/modal into focused components without changing existing behavior.
- Automated unit, component, end-to-end, and accessibility tests should be added before production use.
- A full keyboard/screen-reader audit and automated accessibility scan should be part of release validation.

## Verification commands

```bash
npm ci
npm run lint
npm run build
npm run preview
```

These checks must pass in the target environment before the code is considered release-ready. A clean build is not a substitute for manual interaction testing or an accessibility audit.
