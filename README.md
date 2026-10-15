# CROWN Model 2 — The Throne

A permanent ticker/token binding, a bonded contest for its beneficiary, and a Uniswap v4 hook that accrues fully backed fees without calling beneficiaries during swaps.

This repository delivers the contracts, a static canonical ticker page, offline dependencies, Foundry tests, and a runnable local end-to-end demonstration. **No public-chain deployment or funded-wallet transaction was performed.** The earlier project inputs listed no deployed token to preserve. The demo creates an isolated local token; it must never be used to replace a future public deployment.

## Run it

Prerequisites: Foundry with Solidity **0.8.26** available, and Node.js 22 or newer for the site/demo tools. All Solidity and JavaScript library dependencies are vendored as ordinary files. There are no submodules, npm install steps, CDN assets, keys, environment files, or network-dependent tests.

```sh
forge build
FOUNDRY_FUZZ_SEED=0xbb5ee5448534db6c07282a23aa87ad5185c85a6e935fe6c16b35974002221e61 forge test
forge fmt --check

# Fresh local Anvil chain: deployment, liquidity, trades, challenge, flip and all claims.
node tools/demo.mjs

# Also exercise the shipped site's actual forms against that local chain.
node tools/demo.mjs --check-ui

# Keep the chain and static site running for interactive use.
node tools/demo.mjs --serve
```

Open **http://127.0.0.1:8080/?demo=1** after the `--serve` command completes. The controls at the bottom select a local account, buy/sell, and advance local EVM time. Stop with Ctrl-C. Alternate ports: `--port 8555 --site-port 8081`. The CLI starts its own fresh Anvil process and does not connect to a funded wallet. Its loopback transport is independent of HTTP proxy configuration. The local page refuses external wallet connections: local chain ID 4663 must not be mistaken for the public chain with the same ID.

The local demo begins with a genesis payer, then flips to **“Second beneficiary,” Anvil account #1: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`**. This address is a local test identity, **not a proposed public launch recipient**. The actual public genesis beneficiary must be the launch payer, and an actual public successor must be supplied by that challenge's opener. No public successor is preconfigured.

The demo writes [transaction evidence](docs/demo-evidence.json) and a generated, ignored `site/deployment.local.json`. The latter is never the public deployment configuration. `--check-ui` uses a vendored DOM implementation with the real Anvil provider: it tests the actual `site/app.js` handlers and transactions, not mocked contract balances. It does not provide a visual browser or screenshot test.

**Timing:** `MIN_REIGN = 0` allows an immediate initial challenge. The specified **72-hour voting window plus 24-hour timelock still take 96 hours on a public chain**. The local demo advances EVM time; it neither waits four days nor bypasses those rules in deployed contracts. A production registry uses seven days as its minimum reign.

## Contracts and permanent identity

| Contract | Purpose |
|---|---|
| `ThroneRegistry(uint256 minReign)` | Permissionless one-time registration; fixed rules for challenges, settlement and dynasty history. The demo passes `0`. |
| `ProductionThroneRegistry()` | The same registry with `DEFAULT_MIN_REIGN = 7 days`. |
| `ThroneToken(address launchPayer, uint256 initialSupply)` | `Throne Demo` / `THRONE`, 18 decimals, entire nonzero supply minted once to the explicit payer. No owner, mint, burn, tax or upgrade functions. Supply is an explicit launch parameter, not an invented public-launch value. |
| `CrownHook(IThroneRegistry registry, address deployer)` | Permissioned pool setup, immutable pool fee settings, ERC-6909-backed accrual and pull claims. Explicit deployer is the payer/launch operator, never the factory by implication. |
| `CrownHookFactory()` | CREATE2 deployer for the required hook address bits. |

`ticker = keccak256(bytes(uppercase ASCII symbol))`. `tickerId("Throne")` and the site's `id("THRONE")` both return the THRONE ticker. Callers supplying a hash are responsible for using the canonical symbol: a hash cannot be reverse-validated. `registerTicker(ticker, token, beneficiary)` is permissionless, first registration wins, and requires a deployed token and nonzero beneficiary. A token cannot also register under a second ticker in this registry. This is not a trademark registry; registration should be coordinated with genesis deployment to avoid ticker squatting.

The token address is written only by one-time registration. There is no setter, proxy, delegatecall, upgrade, cancellation, administrative beneficiary transfer, or administrative challenge resolution. `controller(ticker)` is an alias of `beneficiary(ticker)`. Winning changes only that wallet and the reign log.

Each ticker has one immutable **canonical pool in this CrownHook**. Uniswap is permissionless: third parties can still create unrelated pools elsewhere. The protocol cannot compel Dexscreener to index a pool or prohibit third-party listings. Once the canonical pool is indexed, publish its verified chart URL without changing the token or pool to obtain a new chart.

## Challenge and settlement rules

1. The current reign must satisfy `MIN_REIGN`; any failed-challenge cooldown must have elapsed. One live challenge includes both the voting period and the timelock, and remains live until finalized.
2. `openChallenge(ticker, candidate)` requires **exactly 0.01 ETH**. The candidate must be nonzero and different from the current beneficiary. The opener can nominate somebody else. The bond becomes the **opener's initial challenger stake**, contributes to quorum, and receives the same refund/slash treatment as other challenger stake.
3. `stake(id, Side.Reigning = 0 | Side.Challenger = 1)` accepts positive ETH while `timestamp < votingEnds`. Repeated stakes and staking both sides are allowed. ETH stays locked until finalization; no flash-loan vote can recover its principal during the voting transaction.
4. Anyone calls `finalize(id)` at or after `openedAt + 72 hours + 24 hours`. Challenger wins iff `challengerStake > reigningStake` **and** their sum is at least **0.05 ETH**, including the bond. Ties or insufficient quorum defend the reigning side.
5. On a win, the current reign receives `to = block.timestamp` and `ended = Dethroned`, a new ongoing reign is appended, and the new minimum reign starts. On failure, the existing reign continues and a **three-day cooldown starts at finalization**, not at voting close.
6. Finalization does no external calls or transfers. Stakers pull with `claimStake(id)`. Anyone may trigger `claimTreasury()`, which pays only `0xf19F11Dee16a341671E6Ed3e209b704C1Bbc3E57`.

`reigns(ticker,index)` exposes `(controller, from, to, ended)`; `reignCount` gives its length. An ongoing reign has `to = 0` and `ended = Ongoing`. `tickerStakeTotals(ticker, side)` exposes lifetime deposits, including bonds; each `challenges(id)` exposes that challenge's two side totals and exact timestamps. `tickerState` exposes the live challenge ID and cooldown. No keeper is privileged, but somebody must submit the finalization transaction.

### Exact wei convention

For losing principal `L` and winning principal `W`:

```text
slash            = floor(L / 5)
loserRefundPool  = L - slash
winnerBonusPool  = W > 0 ? floor(slash / 2) : 0
initialTreasury  = slash - winnerBonusPool

wallet refund    = floor(walletLosingStake * loserRefundPool / L), if L > 0
wallet winnings  = walletWinningStake
                 + floor(walletWinningStake * winnerBonusPool / W), if W > 0
```

Division is integer arithmetic. The aggregate losing refund pool is 80% rounded up when the slash cannot be divided into whole wei. Per-wallet pro-rata payouts round down using full-precision `mulDiv`. When **every depositor in that challenge** has claimed, any remaining division dust is added to treasury credit. This is independent of claim order; the last caller does not receive a windfall. A zero-value refund still marks its principal as claimed. If nobody backed the reigning side and a challenge fails quorum, there are no winning stakers: **the entire 20% slash goes to treasury** rather than remaining locked forever. Claims do not expire.

Example: challenger deposits total 0.06 ETH and reigning deposits total 0.02 ETH. Challenger wins; reigning stakers share 0.016 ETH, challengers share their 0.06 ETH principal plus 0.002 ETH reward, and treasury receives 0.002 ETH. No ETH is created or stranded by the calculation.

## Hook fees and claims

The address must have exactly `afterInitialize`, `afterSwap`, and `afterSwapReturnDelta` permissions: **low 14 bits `0x1044`**. The constructor validates the flags. Deploy using the factory and an off-chain mined salt; do not use an arbitrary `CREATE` address.

```sh
node tools/mine-hook.mjs FACTORY_ADDRESS REGISTRY_ADDRESS DEPLOYER_ADDRESS
```

This only computes and prints a salt, predicted address, and init-code hash; it sends no transaction. Use actual deployment addresses, and rerun whenever compiler settings, source, constructor arguments, or factory address change. Its result can be cross-checked with `CrownHookFactory.predict` and `initCodeHash`.

Because no authoritative Robinhood PoolManager address was supplied, the hook starts explicitly unconfigured. The explicit deployer calls **`configurePoolManager(manager)` once**, using a verified deployed manager. Calls needing it revert `NotConfigured` beforehand; it cannot be replaced afterward. There is no guessed router, manager, owner or launch recipient in source/configuration.

The deployer registers each canonical pool with:

```solidity
registerPool(key, ticker, initialSqrtPriceX96);          // default 100 bps
registerPool(key, ticker, feeBps, initialSqrtPriceX96);  // immutable 0–500 bps
```

The registry token must be one of the pool's currencies. Fee, key, ticker and expected initial price become permanent. **The configured deployer then calls `PoolManager.initialize(key, expectedPrice)` directly.** `afterInitialize` checks that caller and price, preventing another wallet from preempting initialization with a different price; it records `poolTicker[poolId]`. A router/multicall that changes `msg.sender` to a different contract cannot perform this setup. The hook itself must not call `initialize`: v4 skips hooks on self-initiated actions. New pools for other tickers may be registered; an existing ticker cannot be rebound or repriced by setup.

### Which currency is charged?

An `afterSwap` return delta applies to v4's **unspecified** currency. The fee uses the absolute **actual filled balance delta** in that currency, multiplied by the pool bps and divided by 10,000. It does not charge unfilled requested amounts.

| Swap | Fee currency | Effect |
|---|---|---|
| Exact input, ETH → THRONE | THRONE | Reduces output |
| Exact input, THRONE → ETH | ETH | Reduces output |
| Exact output, ETH → THRONE | ETH | Increases required input |
| Exact output, THRONE → ETH | THRONE | Increases required input |

Thus the crown can earn both ETH and THRONE. A 100 bps hook fee is separate from the pool's LP fee. Routers must account for the returned delta and apply slippage to the final amounts. The local-only `test/helpers/DemoRouter.sol` intentionally omits production slippage/deadline protection and **must not be deployed as a public trading router**.

### Backing and liveness

During `afterSwap` the only external calls are a bounded, fixed-output **registry `staticcall`** and **`PoolManager.mint(address(this), currency.toId(), cut)`**. Mint creates a negative transient delta; the hook's returned positive delta offsets it in the same unlock. The hook holds a real ERC-6909 claim, backed by settlement, for every accrued unit. It credits:

```text
crownOwed[beneficiary][currency] += cut
owedByTicker[ticker][beneficiary][currency] += cut
crownPaid[ticker][currency] += cut
```

`crownPaid` is the requested **cumulative accrued** counter, despite its name. It is never reduced on claim. `crownClaimed[ticker][currency]` records actual claims. Registry failure, malformed/oversized output, a zero beneficiary or exhaustion of the read's 30,000-gas allowance skips the fee, allowing the swap to proceed. No fee is recorded without backing. The hook cannot guarantee liveness of an inherently malicious underlying token or untrusted PoolManager; those are separate integration assumptions. Beneficiary-controlled receive/fallback code is never invoked by fee accrual.

`claim(currency)` withdraws the caller's **entire** balance in that currency across all its tickers. `claim(ticker,currency)` provides bounded work when there are many tickers; this is what the canonical page uses. Both zero the corresponding balance before interactions. In their own unlock, the hook burns its ERC-6909 claim and takes the currency **to the hook**. Only after `unlock` returns and the manager is locked does the hook transfer to the caller. Reentrancy is blocked. Claims attempted during another unlock revert without losing credit. A rejecting recipient can fail its own claim; it cannot block swaps, finalization, or other beneficiaries' claims.

For every ticker/currency, across all beneficiaries:

```text
crownPaid = crownClaimed + sum(owedByTicker)
```

Across all tickers, ERC-6909 balance backs the sum of outstanding credits in that currency. Unsolicited donations of claims or tokens can add surplus; there is no administrative rescue or withdrawal of liabilities.

## Site

`site/` is a static site with a local vendored ethers build. It shows the immutable token and pool, controller/beneficiary, accrued and claimed totals for both currencies, per-wallet claims, chronological reigns, voting totals, quorum, deadlines and action forms. It validates the RPC chain ID, deployed contract code, registry binding, hook registry/manager, and canonical pool key before enabling interactions. Wallet transactions verify chain ID again. Amounts remain bigint wei throughout.

Serve `site/` from any static host. `site/deployment.json` deliberately contains **null unconfigured deployment fields** and no dummy addresses. After public deployment, fill it with the actual addresses, pool key/ID, deployment block, and a verified canonical chart URL. The page displays an explicit awaiting-launch state until then. Native ETH's zero currency address in a `PoolKey` is Uniswap's standard currency encoding, never a stand-in beneficiary or manager.

## Canonical ticker page (`web/`, export in `dist/`)

The published page is a Vite, React and TypeScript app in `web/`, exported as plain files to `dist/` (relative base, one page, no server). It is the page a visitor opens to use the contracts: the one THRONE token and its pool facts, the current throne holder (controller and beneficiary are the same wallet), accrued and claimed crown fees with Claim controls, the reign history, the live challenge (phase, both stakes, quorum, time left) with Open challenge, Stake and Finalize, stake recovery, the treasury payout, and a plain-English how-it-works section. The earlier static page in `site/` remains the local Anvil demo's UI (`node tools/demo.mjs --serve`); the exported app in `dist/` is what gets hosted.

Configuration lives in two places only: `web/src/config.ts` (chain id 4663, public RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robin.etherscan.io`, the treasury, the spec constants, the three ABIs under `web/src/abi/`, and the wagmi connector set) and the runtime file `dist/deployment.json` (`web/public/deployment.json` in source) that carries the deployed addresses, pool key and chart URL. Addresses are **null until launch**; the page then shows an awaiting-launch state with the controls gated. When a launch handoff ships `imd-deployment.json`, set `"manifest": "imd-deployment.json"` in `deployment.json` and the app reads the contract set, pool key and network block from the manifest instead. No private credentials exist anywhere in the bundle.

Wallets connect one way: browser extensions by EIP-6963, phones through "Open in MetaMask / Coinbase Wallet / Rabby / Phantom" links, and Coinbase Smart Wallet. No relay and no WalletConnect project id. On the wrong network the control reads "Switch to Robinhood Chain"; a wallet that does not know the chain is sent `wallet_addEthereumChain` with the public RPC and explorer from `config.ts`. Swaps are not offered on the page because the network's vetted Uniswap router table (`.imd/reads/network.json`) was not supplied; the page says so and links the pool contracts instead.

```sh
cd web
npm ci                 # install from the committed package-lock.json
npm run typecheck      # tsc --noEmit
npm test               # vitest: formatting, phases, challenge math, configuration loading
npm run build          # writes ../dist with base ./
npm run preview        # serve the export locally
```

Rebuild after any change under `web/` and commit `dist/` with the source; the publisher pins the committed files without rebuilding. `node_modules` is never committed. Validation results, the design review and its limitations are in [docs/validation-site.md](docs/validation-site.md); the implemented design tokens and components are in [DESIGN.md](DESIGN.md).

## After launch

These operations belong to the launch payer/operator. The application cannot invent the missing public values or execute them without deployment authority.

1. Choose the actual initial supply, liquidity, opening price and LP fee. The local demonstration uses 1,000,000,000 THRONE, 100 ETH / 100 THRONE full-range liquidity at price 1, LP fee 3000 (0.3%), spacing 60, and a 100 bps crown fee. These are **local fixture economics**, not public launch recommendations.
2. Deploy the registry (`0` for the requested demo launch, `7 days` or `ProductionThroneRegistry` for production) and token to the actual payer. Register THRONE to that exact token and payer once. Never redeploy/remint a registered launch token to change its beneficiary.
3. Verify the target chain's authoritative Uniswap v4 PoolManager address and bytecode/interface before calling `configurePoolManager`. Obtain it from the chain/network's approved Uniswap deployment records. The supplied chain inputs did not contain a verified manager; code existence alone is not an identity check. Source chain endpoint: `https://rpc.mainnet.chain.robinhood.com`; explorer: `https://robin.etherscan.io`; chain ID **4663**.
4. Deploy the factory and mined hook with the registry and explicit launch payer/operator. Register the pool with its final fee/key/price and initialize as that operator. Seed liquidity through a verified compatible v4 periphery; the fixture router is not a production substitute. Keep exact approvals and slippage limits.
5. Verify source and constructor parameters, then populate the public site configuration: `dist/deployment.json` (or the launch's `imd-deployment.json` manifest, referenced from it) with the registry, hook, token, PoolManager, pool key and verified chart URL. Export ABIs with `node tools/export-abi.mjs` after compiling and regenerate `web/src/abi/` if the contracts ever change. Publish `dist/` and the verified indexed pool/chart link. Do not publish the local configuration as a public deployment.
6. Monitor challenges. Anyone may finalize after the timelock; each staker and fee beneficiary must submit its own claim. Anyone may trigger the fixed treasury payout. There is no automatic transaction scheduler or privileged keeper.

The registry has no owner, pause, rescue, upgrade or emergency override. Hook setup authority is limited to the explicit deployer, the one-time manager selection and registration of new immutable pool entries. No hook operation can change the registry's token or beneficiary. Loss of setup authority before configuration/initialization prevents finishing that setup. Transactions and clocks on Robinhood depend on its sequencer and chain availability; timestamp windows do not remove censorship or transaction-inclusion risk.

## Compiler, reproducibility and verification

The root [foundry.toml](foundry.toml) pins:

| Setting | Value |
|---|---|
| Solidity | `0.8.26` |
| EVM | `cancun` (v4 uses EIP-1153 transient storage) |
| Optimizer | enabled, 200 runs |
| Via IR | `true` |
| Metadata bytecode hash | `ipfs` |
| CBOR metadata | enabled |
| Build info / compiler metadata | emitted |
| FFI / filesystem cheatcode permissions | disabled / empty |

Keep these settings, ordinary vendored source files, remappings, original compiler metadata and exact constructor arguments for Sourcify. `out/build-info/` and each artifact's `metadata` are generated by `forge build`. Project contracts have no externally linked library placeholders. Verify the **actual** deployed address using Sourcify with this compiler/configuration; for example, after substituting recorded values:

```sh
forge verify-contract DEPLOYED_REGISTRY src/ThroneRegistry.sol:ThroneRegistry \
  --chain 4663 --verifier sourcify --compiler-version 0.8.26 \
  --constructor-args "$(cast abi-encode 'constructor(uint256)' 0)"
```

Verify the hook with `(address registry,address deployer)`, token with `(address launchPayer,uint256 initialSupply)`, and factory with no arguments. `ProductionThroneRegistry` also has no constructor arguments. A public verification receipt cannot exist before a public deployment; Sourcify support/API availability must be checked by that deployer. Source hashes and dependency provenance are recorded in [docs/dependencies.md](docs/dependencies.md).

## Checks and scope of review

Foundry tests use the **actual vendored PoolManager**, not a settlement mock. They cover registration permanence, bonded voting, exact boundaries, ties/quorum, cooldown, refunds/rewards/dust, rejection/reentrancy, both swap directions and exactness modes, partial fills, malformed/gas-burning registry reads, 0/500 bps fees, multi-ticker claims, and claim rollback. The malicious beneficiary is first shown to break an unsafe mid-unlock push with `CurrencyNotSettled`, then shown unable to affect crown fee accrual. The complete buy/challenge/stake/finalize/buy test asserts byte-identical token identity, unchanged pool/supply, new-beneficiary accrual, and claimed/accrued backing.

The two 256-case fuzz tests use the assignment's seed. Test state is per-test, uses no environment reads/writes, requires no fork RPC, and has no filesystem/FFI dependency. Frontend handlers and the local deployment flow are additionally checked by `node tools/demo.mjs --check-ui`. Results and boundaries are in [docs/validation.md](docs/validation.md).

These checks are not an independent security audit. An independent adversarial review remains a public-release responsibility, especially for fee settlement, external PoolManager selection, economic parameters, and permanent registration/setup. Slither, Mythril and public-chain deployment/verification were not run. There are no hidden administrative repair mechanisms if immutable code is deployed incorrectly.
