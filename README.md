# Analytics

React port of ActionableAgile Analytics. The app lives in `src/app` (Vite, React, TypeScript). This repository ports Analytics only. It does not port the Twig game.

**Status:** full analytics React port, phases 0–7, plus a Linear team import. [docs/PARITY.md](docs/PARITY.md) lists the thirteen views, what else was ported, intentional differences, and known gaps.

## Linear

Data → Linear… loads one team’s issues into the charts. Save a personal API key under Settings first. The key is stored in `localStorage` (`twig.analytics.linear.apiKey`) and is sent only to `https://api.linear.app/graphql`. A script that runs on this page can read that key. The team picker asks for a since date, defaulting to the first day of the month three months ago. That first load keeps issues completed since then and every open issue. The imported dataset is kept in IndexedDB (`twig-analytics-dataset`) so a reload restores it, including the closed-through date. While that snapshot is active, Refresh loads issues updated after the last successful fetch and merges them by id. Canceled, duplicate, and triage issues are always left out. Jira and Trello are unchanged stubs.

## Run the app

```bash
cd src/app
npm install
npm run dev
```

## Reference

`original/` is a frozen reference copy of the legacy app, including `original/analytics/index.html`. Read it to match existing Analytics behavior. Never modify, delete, or reformat anything under `original/`. That freeze stays in place after the port.
