# Brand (provisional)

The Analytics chrome in `src/app` uses a stand-in for Apaleo Brand Identity. The Notion page is not applied: the Notion connector is unauthenticated in this environment, and a public fetch of the page returns 404. Replace every value in this note when that page can be read. Do not treat these tokens as locked.

Public signals used until then:

| Signal | Value | Status |
| --- | --- | --- |
| Dark Fern | `#284907` | Provisional primary |
| White | `#FFFFFF` | Provisional |
| Ebony | `#111827` | Provisional neutral |
| Wordmark | lowercase `apaleo`, then `Analytics` | Provisional |
| Tone | Playful and structured | Tone only |

## Themes

Light and Dark both stay. Settings still switches them. Variables live on the theme root in `src/app/src/ui/theme.tsx` and drive shell, dialogs, and charts (`--aa-*`, including `--aa-chart-1` … `--aa-chart-5`).

Light is White and Ebony, with surfaces pulled a step toward fern. Dark Fern is the accent, with white text on it. Dark is an Ebony family: page `#111827`, raised surface `#1f2937`, sidebar `#0b1220`. Dark Fern is too dark to sit on Ebony as a button fill, so the dark accent is a lifted fern (`#c5d68a`) with Ebony text. That dark palette is not the previous forest-green theme.

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#f4f5f2` | `#111827` |
| Surface | `#ffffff` | `#1f2937` |
| Sidebar | `#eef1ea` | `#0b1220` |
| Text | `#111827` | `#f9fafb` |
| Muted | `#4b5563` | `#c5cdd6` |
| Border | `#d9ddd4` | `#374151` |
| Accent | `#284907` | `#c5d68a` |
| Accent strong | `#142804` | `#e4f0c4` |
| Accent soft | `#e7eedc` | `#24301c` |
| On accent | `#ffffff` | `#111827` |
| Link / series blue | `#1f5f73` | `#9fd0e0` |

Chart series are brand green and neutrals plus a few hues that stay distinct on both themes (teal, amber, clay, plum). They are a readable stand-in, not a Notion data-viz palette. Heat-map cells mix `--aa-chart-1` into the row color. Focus rings use the accent.

Control radii stay 8px and chart frames stay 12px. Notion spacing and radius rules are not applied.

## Type

UI text uses [DM Sans](https://fonts.google.com/specimen/DM+Sans) from Google Fonts (`src/app/index.html`), then `Segoe UI`, `system-ui`, and `sans-serif`. Chart tick labels inherit that stack and use tabular lining numbers. DM Sans is a stand-in until the Brand Identity typefaces are known.

## Wordmark

The header, to the left of the menus and the source switcher, shows lowercase **apaleo** and **Analytics**. The two offset squares are a provisional geometric mark in the accent color. There is no official logo file and no invented wordmark SVG. The favicon repeats that square motif in Dark Fern.

## Language

Copy is English only. `t()` reads one `MessageKey` map. Settings has no language control. Preferences do not store `locale`. A value already saved under that key is ignored and dropped on the next preferences write.

## Still required

Authenticate Notion (or paste the Brand Identity token summary) and replace this file, `theme.tsx`, the font link, and the wordmark with the page’s colors, type, logo, and spacing.
