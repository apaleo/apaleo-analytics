# Analytics parity

Status: full analytics React port, phases 0–7. The app is `src/app` (Vite, React, TypeScript). This note compares that app with the frozen legacy UI in `original/analytics/index.html`.

`original/` is a frozen reference. Do not modify, delete, or reformat it.

## What was ported

Thirteen views, in the legacy order. None of them is a placeholder. The app opens on **Aging Work In Progress**.

| View | Chart id |
| --- | --- |
| Cycle Time Scatterplot | `cycle-time-scatterplot` |
| Cycle Time Histogram | `cycle-time-histogram` |
| Throughput Histogram | `throughput-histogram` |
| Cumulative Flow Diagram | `cumulative-flow` |
| Monte Carlo: How Many | `monte-carlo-how-many` |
| Monte Carlo: When | `monte-carlo-when` |
| Aging Work In Progress | `aging-wip` |
| Flow Efficiency | `flow-efficiency` |
| Heat Map | `heat-map` |
| Throughput Run Chart | `throughput-run` |
| WIP Run Chart | `wip-run` |
| Dashboard | `dashboard` |
| Source Data | `source-data` |

Each chart reads the filtered work items. Empty filters show an empty state instead of a blank plot. Source Data is a column-mapping table plus the filtered rows (id, link, title, stage dates, attributes, blocked days).

**Data.** CSV and Excel (first worksheet, via SheetJS) use the same column rules as the example sheet. JSON accepts a domain dataset or flat rows. Example data reloads the built-in sample. A failed import keeps the current dataset and shows the error. Warnings from a successful import are listed. Recent files store the name and time only (up to 8). A file import under 5 MB is also kept in the source library so the header can reopen it. Jira and Trello stay in the Data menu and explain that the adapter is not configured.

**Linear.** Data → Linear… lists teams from `https://api.linear.app/graphql`, including a child team under its parent. The user picks one team and a “Load issues since” date, which defaults to the first day of the month three months earlier. Issues for that team, including archived issues, become a dataset when they were completed on or after that date or are still open: workflow states in Linear position order, with canceled, duplicate, and triage state types omitted. Backlog states use the backlog role. Stage dates are the first history transition into each state, with `createdAt`, `startedAt`, and `completedAt` when history is missing. Canceled, duplicate, and triage issues are always left out. Refresh, shown only for a Linear dataset, fetches issues updated after the last successful fetch (`updatedAt`, or archived or canceled after that instant), merges them by work-item id, and keeps filters whose attributes and stages still exist. A snapshot with no fetch time refreshes once with the completion window (closed-through day, otherwise the original since date) and then stores the fetch time. The first import still includes every open issue. The personal API key lives in `localStorage` under `twig.analytics.linear.apiKey`. It is sent only to `api.linear.app`. Any script on this page can read it. Saved datasets live in IndexedDB database `twig-analytics-dataset` (`snapshots` keyed by `example`, `linear:{teamId}`, or `file:{slug}`, plus a `catalog`). A previous single `current` record is copied to `linear:{teamId}` when preferences still point at Linear. The header lists Example Data and every stored snapshot (up to 12 file or Linear entries). Choosing a Linear team loads its snapshot, then runs the same incremental Refresh. Switching away aborts an in-flight refresh. Example and file switches do not call Linear. Preferences store `activeSourceId`, the team id, fetch time, and closed-through date, not the issues. A snapshot over 5 MB is refused and the other saved teams stay. There is no OAuth and no write-back to Linear. Blocked days are not mapped.

**Export.** Chart PNG (`html-to-image`), raw CSV, and filtered CSV. Dates are `YYYY-MM-DD`.

**Settings.** Light and dark theme. English only. Theme, the last chart, recent names, the active source id, and a Linear team pointer persist in `localStorage` (`twig.analytics.prefs`, capped at 8 KB). A previously saved `locale` is ignored and is left out of the next write. The Linear API key is a separate `localStorage` entry and is not part of that 8 KB blob. See the Linear note under Data for the XSS risk of storing the key.

**Filters.** One global panel: attribute values (including `[A|B]` cells) and workflow stages. The chart uses the rows that pass.

**Charts, in short.**

- Scatterplot, cycle-time histogram, and aging WIP use cycle time and the 50 / 70 / 85 / 95 percentiles. Aging colors by those percentiles when enough items have finished, otherwise by fixed age bands.
- Throughput histogram, throughput run (daily count and 7-day average), WIP run, cumulative flow, and the weekday heat map cover flow over time.
- Flow efficiency uses a blocked-days column when the sheet has one. Otherwise waiting time is dwell in the first workflow stage.
- Monte Carlo samples historical throughput with replacement. Trials are chosen from 10K, 100K, 500K, or 1M (default 10K). Throughput is per day or per week (default week). How Many sets a lookahead; its histogram axis is completed-item counts. When includes open workflow items (on by default) plus extra items, and labels finish dates on the histogram axis (period 0 is the as-of day). An optional seed and a percentile table sit under the histogram.
- The dashboard shows cycle time (selectable percentile), WIP, how many, throughput stability, and when.

## Intentional differences

- Charts are React components. Most plots use Recharts. The heat map is a CSS grid. The legacy app draws with the Closure Library's SVG layer. This is not a pixel clone.
- The port does not include the Twig game, Return to Twig, or Firebase auth.
- Jira and Trello do not collect credentials, call those APIs, or run the board wizards. There is no VSTS / Azure DevOps wizard.
- Linear is an extra source. The legacy Data menu does not talk to Linear. This port calls Linear’s GraphQL API from the browser with a personal API key. It does not use OAuth, and it does not update Linear.
- Excel is parsed in the browser with SheetJS. Only the first worksheet is read.
- JSON import is extra. The legacy Data menu loads Excel or CSV, not JSON.
- Theme is light or dark. The legacy Settings menu switches named color schemes. This port uses provisional Apaleo tokens (Dark Fern, White, Ebony) documented in `docs/BRAND.md`. Those values are not the legacy schemes, and they are not the final Notion Brand Identity tokens.
- English only. Chart names match the legacy English nav. The legacy Settings menu includes a language toggle. This port does not.
- The port opens on Aging Work In Progress. The legacy app opens Cycle Time Scatterplot unless a `page`, `tab`, `home`, or `chart` query selects another view.
- Info links go to the same public pages (book, introductory videos, release notes, contact). The About block states ActionableAgile™ Analytics and "Copyright 2013-2020 ActionableAgile". The welcome splash and trial terms are not ported.
- Monte Carlo is a throughput bootstrap with the controls above. It does not reproduce the legacy simulation chrome.
- Recent files do not keep file bytes, so a name in that list does not reload the file. The header source list does reload a file snapshot that fit under the 5 MB cap.
- Chart PNG capture uses an SVG `foreignObject`. Very large charts, cross-origin images, and some browsers can refuse it. Captures above about 1.6 million CSS pixels are taken at 1x instead of 2x.

## Known gaps / follow-ups

- Per-chart controls from the legacy charts: percentile toggles, stalled-item blink, aging replay, horizontal crosshair, start and done stage pickers, coloring dots by an attribute, chart-only item filters, a date scrubber, and smoothing.
- Keyboard shortcuts (`s` `i` `t` `c` `h` `w` `a` `e` `m` `p` `r` `b` `d`) and opening a chart from the query string.
- Settings that are not ported: show sidebar, icon labels, animate charts, confirm exit, clear browser storage, and date display format. Import still detects `ymd`, `dmy`, and `mdy`.
- Load from URL.
- Live Jira, Trello, and VSTS / Azure DevOps import, including column mapping wizards.
- Welcome splash and trial-terms dialog.
- A control to remap workflow columns, or to mark queueing stages for flow efficiency.
- The legacy dashboard is a six-tile board. This dashboard is the five cards listed above.
- Tooltips, summary statistics, and "not enough data" prompts are a reduced set. Several legacy charts ask for at least 10 completed items before they will draw.
- The Info menu does not include Show Welcome.
- An incremental Linear refresh does not see issues that were permanently deleted, so those rows stay until the team is imported again.
