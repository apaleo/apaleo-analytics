# Analytics

React + TypeScript + Vite app for workflow charts. `npm test` runs the unit tests. `npm run build` typechecks and builds.

## Import and export

The Data menu replaces the current dataset. A failed import leaves the current dataset in place and shows the error.

- **CSV.** Choose a `.csv` file. Parsing uses the same rules as the example sheet: an ID column, optional link and title, dated workflow stages, then attributes. Warnings list rows that were skipped.
- **JSON.** Two shapes:
  1. A domain dataset. `stages` is `[{ "name", "role": "backlog" | "workflow" }]` (at least two workflow stages; a backlog stage, when present, is first). `items` is `[{ "id", "title?", "link?", "stageDates", "blockedDays?", "attributes?" }]`. Each `stageDates` entry is `YYYY-MM-DD` (a trailing time is ignored) or `null` when the item has not reached that stage. Optional fields: `sourceName`, `dateOrder` (`ymd`, `dmy`, `mdy`), `idColumn`, `linkColumn`, `titleColumn`, `attributeColumns`, `blockedDaysColumn`. Those column fields may sit under `metadata` instead.
  2. Flat rows: a top-level array, `{ "rows": [...] }`, or `{ "items": [...] }` when the objects are column values rather than domain items. Keys become the header, then the CSV column rules apply. Write dates as strings such as `2026-01-06`.
- **Excel.** The first worksheet of `.xlsx` or `.xls` is read with SheetJS and passed through the same column detection. Later sheets are ignored.
- **Example data** reloads the built-in sample.
- **Linear.** Choose Linear…, pick a team or a child team, and a since date (default: the first day of the month three months ago). The first load keeps issues completed since that date and every open issue. A personal API key is saved under Settings in `localStorage` (`twig.analytics.linear.apiKey`). The browser sends that key only to `https://api.linear.app/graphql`, with no `Bearer` prefix. Any script on this page can read the key. Each saved dataset is stored in IndexedDB (`twig-analytics-dataset`: up to 12 file or Linear snapshots, plus Example, 5 MB each). The header dropdown restores the active one. Choosing a Linear team loads its snapshot and runs Refresh. Refresh, in the top bar, loads issues updated after the last successful fetch and merges them by id. A snapshot with no fetch time does one completion-window refresh, then later refreshes are deltas. Canceled, duplicate, and triage issues are always left out. Exports larger than 5 MB are not saved. Jira and Trello are not this path.
- **Jira and Trello** only explain that the adapter is not configured and is waiting on a backend. They do not connect to those services.

Export downloads the full dataset, or only the rows that match the current filters, as UTF-8 CSV with a byte-order mark. Dates are `YYYY-MM-DD`. Empty stage cells that were filled from the next stage are written as that date.

**Chart PNG** saves the active chart with `html-to-image`. The capture uses an SVG `foreignObject`, so a very large chart, an image from another site, or some browsers (including some Firefox versions) can refuse the download. Charts larger than about 1.6 million CSS pixels are captured at 1x instead of 2x.

Theme, the last chart, recent file names with timestamps, the active source id, the Linear team id, and the closed-through date are restored from `localStorage` (`twig.analytics.prefs`). The UI is English only. A saved `locale` is ignored and omitted from the next write. File contents and Linear issue payloads are not stored there. The recent list keeps 8 names, and the saved preferences are capped at 8 KB. The Linear API key is the separate key named above. Visual tokens are provisional; see `docs/BRAND.md`.
