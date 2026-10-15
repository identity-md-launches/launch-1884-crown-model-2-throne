/**
 * The one place for chain, RPC, explorer, contract addresses, ABIs and wallet configuration.
 *
 * Nothing here is private. Deployment addresses are not hard-coded: the app loads them at runtime
 * from `imd-deployment.json` (the workflow handoff format, when the launch supplies one) or from
 * `deployment.json` beside index.html, so the published export can be configured without a rebuild
 * and can never disagree with the manifest it ships with.
 */
import { defineChain, isAddress, keccak256, parseEther, toBytes, zeroAddress, type Address, type Hex } from "viem";
import { createConfig, http } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { throneRegistryAbi } from "./abi/ThroneRegistry";
import { crownHookAbi } from "./abi/CrownHook";
import { throneTokenAbi } from "./abi/ThroneToken";

export { throneRegistryAbi, crownHookAbi, throneTokenAbi };

export const SITE = {
  name: "THRONE",
  title: "THRONE: one token, every reign",
  description:
    "The canonical THRONE ticker page. See who holds the throne, stake in a challenge, and claim crown fees from the Uniswap v4 pool.",
};

/** Robinhood Chain, from the project record (README and site/deployment.json of the accepted build). */
export const CHAIN_ID = 4663;
export const PUBLIC_RPC_URLS = ["https://rpc.mainnet.chain.robinhood.com"];
export const EXPLORER_URL = "https://robin.etherscan.io";

export const chain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: PUBLIC_RPC_URLS } },
  blockExplorers: { default: { name: "Robinhood explorer", url: EXPLORER_URL } },
});

/** Parameters for wallet_addEthereumChain when a wallet does not know the chain (EIP-3085). */
export const WALLET_ADD_CHAIN = {
  chainId: `0x${CHAIN_ID.toString(16)}` as Hex,
  chainName: chain.name,
  nativeCurrency: chain.nativeCurrency,
  rpcUrls: PUBLIC_RPC_URLS,
  blockExplorerUrls: [EXPLORER_URL],
};

/** `ticker = keccak256(bytes("THRONE"))`, the registry's canonical ticker id. */
export const TICKER: Hex = keccak256(toBytes("THRONE"));
/** Uniswap v4's native-currency encoding. Never a recipient or a stand-in address. */
export const NATIVE: Address = zeroAddress;
/** The fixed treasury the registry pays; pinned by the accepted build. */
export const TREASURY: Address = "0xf19F11Dee16a341671E6Ed3e209b704C1Bbc3E57";

/** Specification constants, used for copy before the chain answers; live values are read from the registry. */
export const SPEC = {
  bond: parseEther("0.01"),
  quorum: parseEther("0.05"),
  votingWindow: 72n * 3600n,
  timelock: 24n * 3600n,
  failedCooldown: 3n * 86400n,
  slashPercent: 20,
  defaultFeeBps: 100,
  productionMinReign: 7n * 86400n,
};

export const REFRESH_MS = 12_000;

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

export type Deployment = {
  chainId: number;
  registry: Address | null;
  hook: Address | null;
  token: Address | null;
  poolManager: Address | null;
  poolKey: PoolKey | null;
  chartUrl: string | null;
  /** Uniswap v4 periphery for swaps, present only when the network's vetted chain table was supplied. */
  uniswap: { universalRouter: Address; quoter: Address; permit2: Address } | null;
  source: "imd-deployment.json" | "deployment.json";
};

/** True when every address needed to read the throne is configured. */
export function isConfigured(d: Deployment | null): d is Deployment & {
  registry: Address;
  hook: Address;
  token: Address;
} {
  return !!d && !!d.registry && !!d.hook && !!d.token;
}

const addr = (v: unknown): Address | null => (typeof v === "string" && isAddress(v) && v !== zeroAddress ? v : null);

function poolKeyFrom(v: unknown): PoolKey | null {
  if (!v || typeof v !== "object") return null;
  const k = v as Record<string, unknown>;
  const c0 = typeof k.currency0 === "string" && isAddress(k.currency0) ? k.currency0 : null;
  const c1 = addr(k.currency1);
  const hooks = addr(k.hooks);
  if (!c0 || !c1 || !hooks) return null;
  return { currency0: c0, currency1: c1, fee: Number(k.fee), tickSpacing: Number(k.tickSpacing), hooks };
}

/** Read `imd-deployment.json` (handoff manifest) first, then the project's `deployment.json`. */
export async function loadDeployment(fetchImpl: typeof fetch = fetch): Promise<Deployment> {
  const file = await fetchImpl("./deployment.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const d = (file ?? {}) as Record<string, unknown>;
  // `deployment.json` points at the handoff manifest when the launch ships one, so the page never fetches a missing file.
  const manifest = d.manifest === "imd-deployment.json"
    ? await fetchImpl("./imd-deployment.json").then((r) => (r.ok ? r.json() : null)).catch(() => null)
    : null;
  if (manifest && Array.isArray(manifest.contracts)) {
    const byName = (name: string) =>
      addr(manifest.contracts.find((c: { name?: string }) => c?.name === name)?.address);
    const net = manifest.network?.uniswapV4 ?? manifest.network ?? {};
    const universalRouter = addr(net.universalRouter);
    const quoter = addr(net.quoter);
    const permit2 = addr(net.permit2);
    return {
      chainId: Number(manifest.chainId ?? CHAIN_ID),
      registry: byName("ThroneRegistry"),
      hook: byName("CrownHook"),
      token: byName("ThroneToken"),
      poolManager: addr(net.poolManager),
      poolKey: poolKeyFrom(manifest.poolKey),
      chartUrl: null,
      uniswap: universalRouter && quoter && permit2 ? { universalRouter, quoter, permit2 } : null,
      source: "imd-deployment.json",
    };
  }
  const chartUrl = typeof d.chartUrl === "string" && /^https:\/\//.test(d.chartUrl) ? d.chartUrl : null;
  return {
    chainId: Number(d.chainId ?? CHAIN_ID),
    registry: addr(d.registry),
    hook: addr(d.hook),
    token: addr(d.token),
    poolManager: addr(d.poolManager),
    poolKey: poolKeyFrom(d.poolKey),
    chartUrl,
    uniswap: null,
    source: "deployment.json",
  };
}

/** No relay and no project ID: EIP-6963 extensions, the wallet's own browser on phones, Coinbase Smart Wallet. */
export const walletConnectProjectId = "";

export const wagmiConfig = createConfig({
  chains: [chain],
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), coinbaseWallet({ appName: SITE.name })],
  transports: { [chain.id]: http(PUBLIC_RPC_URLS[0]) },
});

export const explorer = {
  address: (a: string) => `${EXPLORER_URL}/address/${a}`,
  tx: (h: string) => `${EXPLORER_URL}/tx/${h}`,
};
