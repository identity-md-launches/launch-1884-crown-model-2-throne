# THRONE ticker page: design system

Taken from the final source of the Vite/React/TypeScript app in `web/` (export in `dist/`). The earlier static page in `site/` kept the same palette and serif headline voice; this document describes only the app that is now published.

## Overview

The page is read by two audiences: a visitor checking who holds the THRONE throne and how fees flow, and a participant who connects a wallet to claim fees, open or stake in a challenge, finalize it and recover a stake. It is a tool page, not a marketing page: one short headline, then the live state and its controls.

Visual character: a warm cream page, one deep moss-green card for the throne itself, gold reserved for the throne's own headline and the stake bar, Georgia for headlines and large numbers, a system sans for everything else. Density is moderate: 16px and 24px gaps, 44px controls. Rules that apply to every page: the token set below, the six-step type scale, one filled action per view, controls inside the content margins. Rules that belong only to this page: the dark throne card, the two-column challenge/refund grid.

## Colors

Defined once in `web/src/styles.css` under `:root`. Primitives are named by hue; components use only the semantic tokens.

| Token | Value | Job |
| --- | --- | --- |
| `--color-bg` | `#f6f4ec` (`--cream-50`) | page background |
| `--color-surface` | `#fcfbf5` (`--cream-100`) | panels, inputs, the connect sheet |
| `--color-surface-strong` | `#20382b` (`--moss-800`) | the throne card |
| `--color-text` | `#1d2d25` | body text |
| `--color-text-muted` | `#5e6e54` (`--moss-500`) | secondary text, labels in `dl.facts` |
| `--color-text-on-strong` / `--color-text-muted-on-strong` | `#f4f2e5` / `#b7c3aa` | text on the throne card |
| `--color-border` / `--color-border-on-strong` | `#d6d9c9` / `#4b5e47` | panel borders, table rules, dividers |
| `--color-action` / `--color-action-hover` / `--color-action-text` | `#263c2d` / `#345238` / `#fffef8` | the filled `.cta` and the reigning share of `.bar` |
| `--color-accent` / `--color-accent-text` | `#d1b666` / `#e2dba1` | status rule on `.status`, step numbers, the `.bar` track, the throne card's `h2` |
| `--color-focus` | `#8a9a2e` | `:focus-visible` ring and the network dot |
| `--color-error-bg` / `--color-error-text` | `#f8e4dc` / `#793b27` | inline errors (`.note.error`) and invalid input borders |

Contrast: the design probe (`taste.mjs`) measured every text pair on the export at 390 and 1440 and reported all at 4.5:1 or better (3:1 large). No other ratios were measured by hand.

## Typography

Families (`web/src/styles.css`): `--font-sans` "Helvetica Neue", Arial, Helvetica; `--font-serif` Georgia, "Times New Roman"; `--font-mono` ui-monospace, SFMono-Regular, Menlo, Consolas. No web fonts are shipped, so the rendered face is whichever system face matches first.

Scale, six steps: `--text-sm` 13px, `--text-md` 15px (body), `--text-lg` 17px, `--text-xl` 22px, `--text-2xl` 30px, `--text-3xl` 44px. Below 640px `--text-3xl` drops to 34px and `--text-2xl` to 24px. Weights: 400 body and serif headings, 600 labels, buttons and `h3`, 700 only on the `h1` and the brand.

Roles: `h1` serif 700 at `--text-3xl`, line-height 1.05, letter-spacing -0.02em, `text-wrap: balance`, the heaviest type on the page. `h2` serif 400 at `--text-2xl`. `h3` sans 600 at `--text-lg`. Large numbers (`.count b`, `.claim-row b`, `.timeline .num`) are serif 400 so they read as data, with `font-variant-numeric: tabular-nums` on anything that changes. Addresses and the pool id use `.mono`. Paragraphs use `text-wrap: pretty` and are capped at `--measure` (62ch). Inputs are 16px so iOS does not zoom. `overflow-wrap: anywhere` on `body` keeps full addresses from forcing horizontal scroll at 320px.

## Layout

Content width `--page` 1120px, 16px side padding, centered. `main` is a grid with 24px row gaps; inside a panel the gap is 12px, so groups read as groups. Spacing steps: 4, 8, 12, 16, 24, 32, 48px (`--space-*`).

Breakpoints come from the content: at 760px the throne card and the challenge/refund pair collapse from two columns to one, and the network pill hides; at 640px the type scale shrinks, panel padding drops to 16px, the claim rows stack, the stake form's two fields stack, and the connect sheet becomes a bottom sheet. Checked in the browser at 320, 390 and 1440: no horizontal scroll with full addresses, a 1,234.567 ETH and 98,765.43 THRONE total, and the sheet open. Intermediate widths between 640 and 760 were not screenshotted.

Order on every width: header (brand leading, network and wallet trailing), headline and one line, status line, throne card with the claim controls, challenge and refund panels, reign history, pool facts, how it works, footer. The `.skip` link is the first focusable element.

## Elevation and depth

Flat. Structure comes from borders (`1px solid var(--color-border)`) on panels, table rows and the history list, and from one tonal layer: the dark throne card. The only shadow-like treatment is the connect sheet's backdrop (`rgb(23 42 32 / 0.55)`). No box shadows, no gradients.

## Shapes

`--radius` 4px on buttons, inputs, the wallet menu and sheet rows; `--radius-lg` 8px on panels, the throne card and the sheet. Badges and the stake bar use `999px`. Wallet icons in the sheet are 28px with a 6px radius.

## Components

All in `web/src/`.

- **`.cta` button** (`styles.css`, used in `App.tsx` and `ConnectSheet.tsx`): the filled primary action, 44px tall. `.ghost` is the neutral outline variant; `.full` stretches it under a form. States: hover (lighter fill, hover-capable pointers only), active (`scale: 0.96`, off under reduced motion), `:focus-visible` ring, disabled at 55% opacity. On the throne card `.ghost` inverts to light text.
- **`Action`** (`App.tsx`): the four-state transaction control. Not connected shows "Connect wallet to …" and opens the sheet; wrong chain shows "Switch to Robinhood Chain" and runs `ensureChain`; otherwise the action, disabled with a reason line while a prerequisite is unmet, busy label while the wallet or chain is working, and a `TxNote` status line (confirm, sent, confirmed with an explorer link, or a plain-language error).
- **`ConnectSheet`** (`ConnectSheet.tsx`): the header's connect control and its dialog. Rows are 48px, EIP-6963 wallets first with their own icons, then Coinbase Wallet; on a phone the "Open in" links first. Escape and the backdrop close it, focus moves to the first row and returns to the trigger, `main` is made `inert` while open. Connected it shows the short address with a Disconnect menu, or the switch control on the wrong chain.
- **`AddressLink`** (`App.tsx`): monospace address, explorer link, and a "Copy" text button with a 1.5 s "Copied" state.
- **Panels** (`.panel`): bordered surfaces for the challenge, refund and pool sections, each with an `h2`, muted lead paragraph and a form or fact list.
- **`dl.facts`**: two-column definition list (110px label column, 90px under 640px) for contract facts.
- **`table.fee-table`**: the accrued/claimed table, tabular numerals, row rules.
- **`ol.timeline`**: reign history rows with a serif ordinal, address, dates and a Reigning/Dethroned state; "Show earlier reigns" loads 20 more.
- **`.badge`**: a small outlined pill for phase and counts.
- **Forms**: every input has a visible `<label for>`, example placeholders, `aria-invalid` and an `aria-describedby` error line in `.note.error` next to the field.

## Do's and don'ts

- Start a new page from `main`'s grid and `.panel`; put live state in a panel and its control directly under the text that explains it.
- Use one filled `.cta` per panel; everything else is `.ghost`.
- Add a color only as a semantic token with a job; never use `--gold-*` or `--moss-*` directly in a component.
- Keep the type to the six `--text-*` steps and three weights; the `h1` stays the heaviest element.
- Never shrink, clip or ellipsize an address or an amount; let it wrap with `.mono`.
- Keep transaction controls disabled until the wallet is connected on chain 4663 and the contract state allows the action; route new actions through `Action` and `useTx`.
- Do not add web fonts, shadows, kicker labels above headings or all-caps labels.

Recipe for another page: copy `index.html`'s head (title, description, favicon, og tags), render `<header class="top">` with `ConnectSheet`, a `.hero` with one `h1` and one line, then `.panel` sections; read chain state through hooks in `hooks.ts` and addresses from `config.ts`.
