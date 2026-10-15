# Vendored dependency provenance

All runtime/build dependencies are ordinary repository files. No submodules, package-manager fetches or CDN requests are needed to build, test, or run the local demonstration. The compiler/Foundry and Node runtime are execution prerequisites rather than repository binaries.

| Dependency | Pin | Included files | License |
|---|---|---|---|
| [Uniswap v4-core](https://github.com/Uniswap/v4-core/tree/e50237c43811bd9b526eff40f26772152a42daba) | v4.0.0, `e50237c43811bd9b526eff40f26772152a42daba` | Production `src/`, upstream README and licenses; upstream test helpers omitted | Per-file SPDX: BUSL-1.1 / MIT; originals under `lib/v4-core/licenses/` |
| [forge-std](https://github.com/foundry-rs/forge-std/tree/77041d2ce690e692d6e03cc812b57d1ddaa4d505) | v1.9.7, `77041d2ce690e692d6e03cc812b57d1ddaa4d505` | `src/`, original licenses | Apache-2.0 / MIT |
| [Solmate](https://github.com/transmissions11/solmate/tree/4b47a19038b798b4a33d9749d25e570443520647) | v4-core's pinned gitlink, `4b47a19038b798b4a33d9749d25e570443520647` | `src/auth/Owned.sol` (needed by PoolManager), original license | AGPL-3.0 root; `Owned.sol` has AGPL-3.0-only SPDX |
| [ethers](https://www.npmjs.com/package/ethers/v/6.15.0) | 6.15.0 | Unmodified `dist/ethers.umd.min.js`, LICENSE.md | MIT |
| [linkedom](https://www.npmjs.com/package/linkedom/v/0.18.12) | 0.18.12 | Unmodified standalone `worker.js` as `tools/vendor/linkedom.mjs`, LICENSE | ISC |

Downloaded npm tarball SHA-256:

```text
ethers-6.15.0.tgz    0ca94f1c7f93ba0450ece0224e83fbbf9e840ea8ecbe05f50550d98f4cfaa482
linkedom-0.18.12.tgz b15cc6324234cd73785619b01a86fd7ada68277f2ec0c571dc0de94d477f750d
```

[dependencies.sha256](dependencies.sha256) inventories the actual vendored files. From the repository root:

```sh
sha256sum --check docs/dependencies.sha256
```

The project imports the v4 types/interfaces directly; the hook selects only the callbacks represented by its address bits. For accounting semantics, see the pinned [Hooks.sol](https://github.com/Uniswap/v4-core/blob/e50237c43811bd9b526eff40f26772152a42daba/src/libraries/Hooks.sol), [PoolManager.sol](https://github.com/Uniswap/v4-core/blob/e50237c43811bd9b526eff40f26772152a42daba/src/PoolManager.sol), and [IPoolManager.sol](https://github.com/Uniswap/v4-core/blob/e50237c43811bd9b526eff40f26772152a42daba/src/interfaces/IPoolManager.sol). Those sources define unspecified-currency return deltas, mint/burn backing and the unlock-wide settlement requirement used by this implementation.
