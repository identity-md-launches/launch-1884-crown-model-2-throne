# Validation

Final local results: **32 Foundry tests passed, 0 failed**, including both 256-case fuzz tests with the seed below. `forge build`, `forge build --sizes`, `forge fmt --check`, the complete CLI + site interaction demo, and the vendored-file hash check passed. Solidity reports `0.8.26+commit.8a97fa7a`, Cancun, optimizer 200, via IR. The project artifacts have no external library link references; deployed runtimes are 5,894 bytes for each registry variant, 7,491 for CrownHook, 8,900 for the hook factory, and 1,265 for ThroneToken, all below EIP-170's size limit.

The delivered check commands are:

```sh
forge build
FOUNDRY_FUZZ_SEED=0xbb5ee5448534db6c07282a23aa87ad5185c85a6e935fe6c16b35974002221e61 forge test
forge fmt --check
node tools/demo.mjs --check-ui
sha256sum --check docs/dependencies.sha256
```

The local Anvil demonstration records every deployment and application transaction in [demo-evidence.json](demo-evidence.json). It checks a buy, bonded challenge, stakes on both sides, claims during voting, simulated full voting/timelock passage, a permissionless finalization, a second buy, new-beneficiary claims, exact loser/winner refunds, and fixed-treasury payment. Its addresses and receipt hashes refer only to that disposable local chain, with chain ID 4663; they are not public-chain evidence.

The UI check loads the actual HTML and JavaScript into linkedom and substitutes only the transport for a real local Anvil provider. It checks initial deployment binding, dynasty entries, disabled disconnected actions, refusal to connect public wallets in local mode, local account selection, nomination, staking/quorum, the 72-hour and 24-hour state transitions, finalization, buys and sells, ETH/token fee claims, and the stake refund. Contract data and transactions are real. No screenshot rendering, browser-extension interaction, public wallet, public indexer, hosted-site deployment, Sourcify submission or public liquidity was tested.

The Foundry test suite has three isolated suites: registry math/state transitions, actual-v4 hook integration, and fixed-supply token behavior. Fuzz tests run 256 cases each using the assignment's specified seed. No test uses environment variables, forks, filesystem cheatcodes, FFI, or privileged deployment keys. All timers are advanced in the test EVM rather than waited out in real time.

The compiler may emit generic lint warnings about timestamp comparisons and checked casts. Timers intentionally use `block.timestamp`. The fee cast is bounded because the source balance delta is int128 and the fee cap is 5%; the beneficiary-address cast occurs only after an explicit uint160 upper-bound check. Test-only casts and token transfer calls operate on the fixed local token. These observations do not constitute independent security review.

Release responsibilities and all setup powers are documented in the root README. In particular, the actual Robinhood PoolManager must be verified and configured once, public deployment economics must be selected by the launch operator, and the live site must be supplied actual deployment/indexer values. No public deployment is represented by the empty public configuration.
