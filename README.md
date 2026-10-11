# PaisaPilot

PaisaPilot is a responsive personal-finance dashboard built with React, TypeScript, Vite, Tailwind CSS v4, Recharts, and Lucide icons. It is designed as an interactive demo for exploring day-to-day money habits.

## What it includes

- **Overview:** balance summary, spending breakdown, transaction highlights, savings goals, and a balance forecast.
- **Smart Budget:** editable category limits and alerts for limits that have been exceeded or may be exceeded at the current spending pace.
- **Transactions:** add and review income and expenses.
- **Decision Lab:** apply a simulated purchase, unexpected expense, or subscription cancellation to the demo data.
- **Savings Goals:** create and track savings targets.
- **Commitments:** review recurring subscriptions and their listed due dates.
- **Spending Coach:** rule-based guidance based on the data entered into the demo.
- **Theme:** light and dark modes.
- **Persistence:** data, category limits, and theme are stored locally in the browser when storage is available.

> **Important:** This is a front-end demonstration, not a bank connection or a financial-advice service. The starter transactions and calculations are illustrative. Data stays in the browser's local storage; clearing browser data removes it. The Spending Coach uses local rules and does not call an AI model or financial institution.

## Requirements

- Node.js 20.19+ or 22.12+ (compatible with current Vite 8 requirements)
- npm

Check versions:

```bash
node --version
npm --version
```

## Run locally

```bash
npm ci
npm run dev
```

Vite prints the local URL in the terminal. Open it in your browser.

## Quality checks

Run these from the `paisapilot` project folder:

```bash
npm run lint
npm run build
npm run preview
```

`npm run build` runs TypeScript project builds before creating the optimized production bundle. `npm run preview` serves the generated `dist` folder locally; it should be run after a successful build.

## Project structure

```text
paisapilot/
├── public/                   # Static assets and favicon
├── src/
│   ├── assets/               # Imported image assets
│   ├── components/
│   │   ├── BalanceChart.tsx
│   │   └── BalanceForecastChart.tsx
│   ├── App.tsx               # App state, finance calculations, page views, forms
│   ├── App.css               # Shared component polish and motion preferences
│   ├── index.css             # Tailwind import, global styles, focus and skip link
│   └── main.tsx              # React entry point
├── index.html                # Document metadata and app mount point
├── eslint.config.js
├── package.json
└── vite.config.ts
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for data flow, design choices, and known limitations.

## Accessibility and responsive design

- Keyboard users can use the **Skip to main content** link and visible focus indicators.
- Primary and mobile navigation use landmark labels and indicate the active page.
- Motion is reduced when the operating system requests reduced motion.
- Layouts use responsive utility classes and should be checked at narrow mobile, tablet, laptop, and wide desktop widths.
- Charts include accessible region labels and loading feedback.

Accessibility is an ongoing target, not a claim of WCAG certification. Use keyboard-only navigation and an automated accessibility audit before release.

## Data and privacy

PaisaPilot does not currently include a backend, authentication, encryption layer, or bank integration. Do not enter real account credentials or sensitive financial information. Browser local storage is accessible to JavaScript running on the same origin. The app tolerates unavailable storage and falls back to sample data when stored data is malformed.

## Suggested manual test pass

1. Load Overview at desktop and mobile widths.
2. Switch light/dark mode and refresh to confirm preference persistence.
3. Add an income and an expense, then verify the summary and recent transactions update.
4. Edit a category limit and confirm the alert state responds.
5. Try a purchase above and below the displayed balance in Decision Lab.
6. Create a savings goal and verify progress values.
7. Use the navigation with a keyboard and confirm focus remains visible.
8. Enable reduced motion in OS settings and confirm animated transitions are minimized.
9. Test with browser storage disabled, then refresh and verify the UI remains usable.
10. Run `npm run lint` and `npm run build` before deployment.

## Deployment

This is a standard Vite static site. Build with `npm run build` and deploy the generated `dist/` directory to Vercel, Netlify, or another static host. For Vercel, the usual settings are:

- Build command: `npm run build`
- Output directory: `dist`

No environment variables are required for the current demo.
