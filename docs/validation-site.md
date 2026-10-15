# Validation: the canonical ticker page (`web/`, export `dist/`)

Worker-side results for the Vite/React/TypeScript app built in this job. The contract results from the earlier jobs are in [validation.md](validation.md). This is the worker's report, not an independent certification.

## 1. Scope and assumptions

- Reviewed: the one page in `web/src/App.tsx` and its connect sheet, in three states: unconfigured (no addresses, as shipped), configured with mocked contract state and no challenge, and configured with a live vote; disconnected, connected on the wrong chain, and connected on chain 4663.
- Export: `dist/` from `npm run build` in `web/` (Vite 7, base `./`, 1.5 MB, 10 files). Node 24.21, npm 11.19.
- Inferred choices: no deployment handoff (`.imd/reads/deployment.json`) and no `.imd/reads/network.json` were supplied, so addresses are null at runtime, no `dist/imd-deployment.json` is emitted, and swap controls are off with the reason shown. The chain's public RPC and explorer come from the project record (`site/deployment.json` of the accepted build). The `wallet_addEthereumChain` parameters are built from those same public values.
- Kept: the project's cream/moss/gold palette and Georgia headline voice from `site/`; the brief gave no other visual direction.
- Excluded: the legacy `site/` page (unchanged, still the Anvil demo UI), the contracts and Foundry tests (accepted earlier).

## 2. Coverage (Better Interface, six domains)

| Domain | Status | Inspected | Not performed |
| --- | --- | --- | --- |
| Accessibility | Checked | Native buttons/links/inputs; every input has a `<label for>`; errors use `aria-invalid` + `aria-describedby` beside the field; `role="status"` notes; skip link first in tab order (browser-checked); dialog with `aria-modal`, Escape, backdrop, focus to first row and back to the trigger, `main` made `inert`; `:focus-visible` ring; reduced-motion guard; 44px controls, 48px sheet rows (measured) | Screen-reader session; forced-colors mode; native 200% zoom (narrow viewports only) |
| Layout | Checked | 320, 390, 1440 with full addresses and long totals: no horizontal scroll (probe + script); content margins; logical properties; collapse at 760/640 from content | Widths between 640 and 760; RTL mirror |
| Writing | Checked | Verb-first buttons; errors state the fix next to the field; one capitalization policy (sentence case); empty/awaiting states point forward; no "Injected" shown | Translation growth |
| Typography | Checked | Six sizes, three weights, three families (probe); `h1` heaviest; tabular numerals on changing values; 16px inputs; measure cap; `text-wrap` balance/pretty; wrapping of a 42-char address at 320 (screenshot) | Real-device rendering of system fonts |
| Colors | Checked | Semantic tokens over hue primitives; one filled action per panel; the probe measured every text/background pair at 390 and 1440 and reported all ≥ 4.5:1 (3:1 large) | Hand measurement of the error red on the dark card (`#f3c9b9` on `#20382b`) was not performed by me; the probe only reports pairs present on the page it loaded (unconfigured state) |
| UI | Checked | Named transition properties, 150 ms, `cubic-bezier(0.2,0,0,1)`, `scale(0.96)` on press, off under reduced motion; flat surfaces, no border+shadow; concentric radii (4px inside 8px) | Replay in the Animations panel |

## 3. Findings and fixes

1. **High, fixed.** `web/src/config.ts` fetched `imd-deployment.json` on every load, a 404 in the export and a probe `render` failure. Now `deployment.json` names the manifest when one ships; no missing fetch. Rechecked: probe `render` passes.
2. **Medium, fixed.** First screen at 390 carried 63 words of prose (bar 60): `web/src/App.tsx` hero line, status line and placeholder copy shortened to 42. Rechecked: probe `copy-budget` passes.
3. **High, fixed.** Wrong-network state never appeared: `useChainId()` returns the configured chain, not the wallet's. `ConnectSheet.tsx` and `Action` in `App.tsx` now read `useAccount().chainId`. Rechecked in the mocked-wallet run: "Switch to Robinhood Chain" shows in the header and in every action.
4. **Low, left.** Chromium reports one aborted `fetch` of the page's own URL per load (`net::ERR_ABORTED`, from a dependency, no visible effect, no console error); recorded, not fixed.
5. The probe reports one control under 44px at 390 (the inline "Copy" text button, 24px minimum met); left as is, spaced from its neighbours.

## 4. Verification

| Command (from `web/` unless noted) | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0, no errors |
| `npx vitest run` | 14 tests passed (`src/logic.test.ts`: amounts, countdown, input validation, error translation, phases incl. MIN_REIGN 0 vs 7 days and cooldown, quorum/strict-majority, the README 0.06/0.02 wei example, `wallet_addEthereumChain` parameters, loading `deployment.json` and a handoff manifest with zero/malformed addresses rejected) |
| `npx vite build` | built in ~21 s, `dist/` 10 files, largest chunk 647 kB |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` (repo root, Playwright 1.64 installed under `~/.imd-taste`) | **16/16 checks passed** on the final export: render, layout, targets, contrast, casing, tracking, eyebrows, type-sizes (5 sizes at 390), type-faces (3/3), glyphs, slogans (1), repetition, copy-budget (42 words), chrome, motion, share. Screenshots `test/scratch/taste/shots/{320,390,1440}*.png` |
| `node test/scratch/check.mjs .` (one foreground command: serves `dist/` under `/preview/`, Chromium, mocked EIP-6963 wallet, mocked JSON-RPC answering every `eth_call` by ABI) | **64/64 checks passed**. Screenshots in `test/scratch/check/`: unconfigured and configured at 320/390/1440, `configured-390-first-screen.png`, `connected-390.png`, `voting-390.png` |

Interactions the script exercised: awaiting-launch state and Connect at all widths; configured reads (full holder address, 1.234567 ETH and 98,765.4321 THRONE accrued, 1% fee, supply, two reigns with Reigning/Dethroned, pool facts, swap-off reason); sheet opens with the EIP-6963 wallet by name and icon, Coinbase Wallet row, 48px rows, Escape closes; connect on chain 1 shows "Switch to Robinhood Chain" in header and action; switch answered 4902 leads to `wallet_addEthereumChain` with the public RPC/explorer, then connected with the short address; claimable 0.25 ETH read for the account; candidate validation (empty, current holder); `openChallenge` sent to the registry with exactly 0.01 ETH, "Confirmed." with an explorer link; `claim(bytes32,address)` sent to the hook with no value; refund lookup shows `claimable` 0.062 ETH; live vote shows both stakes, quorum reached, challenger leads, countdown, the account's own stakes; stake amount validation; `stake(1, Reigning)` sent with 0.05 ETH; keyboard: skip link first, then the header control; no console errors and no horizontal scroll after connecting.

First screen at 390 (`configured-390-first-screen.png`): header with Connect, headline, one line, status, the throne holder with the full address, the fee table and the claim control. At 320 and 390 nothing scrolls sideways with full addresses and the longest totals.

## 5. Not verified / limitations

- No live-chain behaviour: THRONE is not deployed, so no read or transaction ran against Robinhood Chain. Every chain response in the checks was mocked by ABI; gas estimation, reverts from the real registry and hook, and real wallet prompts were not exercised. No transaction was broadcast.
- No WebKit run: Chromium only. Screen reader, forced colors, native zoom, physical devices: not performed.
- `og:image` and favicon are relative paths; the hosted address is unknown until publication.
- The optional `dist/imd-deployment.json` manifest was not produced because no handoff was supplied; the loader for it is covered by a unit test only.

**Completion:** Complete for the stated scope, with the live-chain and WebKit limitations above.
