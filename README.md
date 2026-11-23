# Analytics

React port of ActionableAgile Analytics. The app lives in `src/app` (Vite, React, TypeScript). This repository ports Analytics only. It does not port the Twig game.

## Live app

Open [https://apaleo.github.io/apaleo-analytics/](https://apaleo.github.io/apaleo-analytics/). The app opens on Dashboard.

## Linear

Use the Linear integration already in the app:

1. Open **Settings**.
2. Follow [Create API key](https://linear.app/apaleocom/settings/account/security/api-keys/new), paste the personal key, and choose **Save key**.
3. Open **Data** → **Linear…**, pick a team, set **Load issues since** (the default is the first day of the month three months ago), and choose **Load team**.

Open issues are always included. Canceled, duplicate, and triage issues are omitted. **Refresh** while that snapshot is active loads issues updated after the last successful fetch and merges them by id.

The key is stored only in the browser (`localStorage` key `twig.analytics.linear.apiKey`) and is sent only to `https://api.linear.app/graphql`. A script that runs on this page can read that key. The snapshot is IndexedDB `twig-analytics-dataset`. The key is never part of the GitHub Pages build. Jira and Trello are unchanged stubs.

## Local development

```bash
cd src/app
npm install
npm run dev
```

## Reference

`original/` is a frozen reference copy of the legacy app, including `original/analytics/index.html`. Read it to match existing Analytics behavior. Never modify, delete, or reformat anything under `original/`. That freeze stays in place after the port.

**Status:** full analytics React port, phases 0–7, plus a Linear team import. [docs/PARITY.md](docs/PARITY.md) lists the thirteen views, what else was ported, intentional differences, and known gaps.
