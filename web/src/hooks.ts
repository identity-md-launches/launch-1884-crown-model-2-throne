import { useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import {
  NATIVE,
  REFRESH_MS,
  TICKER,
  crownHookAbi,
  isConfigured,
  throneRegistryAbi,
  throneTokenAbi,
  type Deployment,
} from "./config";
import { errorText } from "./format";
import type { Challenge, Reign, TickerState } from "./throne";

const REIGN_PAGE = 20;

export type ThroneData = {
  ticker: TickerState;
  minReign: bigint;
  bond: bigint;
  quorum: bigint;
  reignCount: bigint;
  ethAccrued: bigint;
  ethClaimed: bigint;
  tokenAccrued: bigint;
  tokenClaimed: bigint;
  poolId: Hex;
  totalSupply: bigint;
  feeBps: number | null;
  challenge: Challenge | null;
  reigns: Reign[];
  owedEth: bigint;
  owedToken: bigint;
  myReigningStake: bigint;
  myChallengerStake: bigint;
  blockTime: number | null;
};

/** Every read the page needs, refreshed on an interval. Reads work before any wallet is connected. */
export function useThrone(dep: Deployment | null, account: Address | undefined, reignLimit = REIGN_PAGE) {
  const configured = isConfigured(dep);
  const registry = { address: dep?.registry ?? undefined, abi: throneRegistryAbi } as const;
  const hook = { address: dep?.hook ?? undefined, abi: crownHookAbi } as const;
  const token = dep?.token ?? NATIVE;
  const poll = { refetchInterval: REFRESH_MS, enabled: configured };

  const base = useReadContracts({
    contracts: [
      { ...registry, functionName: "tickerState", args: [TICKER] },
      { ...registry, functionName: "MIN_REIGN" },
      { ...registry, functionName: "BOND" },
      { ...registry, functionName: "QUORUM" },
      { ...registry, functionName: "reignCount", args: [TICKER] },
      { ...hook, functionName: "crownPaid", args: [TICKER, NATIVE] },
      { ...hook, functionName: "crownClaimed", args: [TICKER, NATIVE] },
      { ...hook, functionName: "crownPaid", args: [TICKER, token] },
      { ...hook, functionName: "crownClaimed", args: [TICKER, token] },
      { ...hook, functionName: "canonicalPool", args: [TICKER] },
      { address: token, abi: throneTokenAbi, functionName: "totalSupply" },
    ],
    allowFailure: false,
    query: poll,
  });
  const b = base.data as
    | [TickerState, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, Hex, bigint]
    | undefined;
  const liveId = b?.[0].liveChallenge ?? 0n;
  const count = b?.[4] ?? 0n;
  const poolId = b?.[9];

  const challenge = useReadContract({
    ...registry,
    functionName: "challenges",
    args: [liveId],
    query: { ...poll, enabled: configured && liveId > 0n },
  });
  const poolConfig = useReadContract({
    ...hook,
    functionName: "poolConfig",
    args: [poolId ?? ("0x" as Hex)],
    query: { ...poll, enabled: configured && !!poolId },
  });
  const start = count > BigInt(reignLimit) ? count - BigInt(reignLimit) : 0n;
  const reignIndexes = Array.from({ length: Number(count - start) }, (_, i) => start + BigInt(i));
  const reigns = useReadContracts({
    contracts: reignIndexes.map((i) => ({ ...registry, functionName: "reigns" as const, args: [TICKER, i] as const })),
    allowFailure: false,
    query: { ...poll, enabled: configured && reignIndexes.length > 0 },
  });
  const mine = useReadContracts({
    contracts: [
      { ...hook, functionName: "owedByTicker", args: [TICKER, account ?? NATIVE, NATIVE] },
      { ...hook, functionName: "owedByTicker", args: [TICKER, account ?? NATIVE, token] },
      { ...registry, functionName: "stakes", args: [liveId, account ?? NATIVE, 0] },
      { ...registry, functionName: "stakes", args: [liveId, account ?? NATIVE, 1] },
    ],
    allowFailure: false,
    query: { ...poll, enabled: configured && !!account },
  });
  const client = usePublicClient();
  const [blockTime, setBlockTime] = useState<number | null>(null);
  useEffect(() => {
    if (!configured || !client) return;
    let stop = false;
    const tick = () =>
      client
        .getBlock({ blockTag: "latest" })
        .then((blk) => !stop && setBlockTime(Number(blk.timestamp) - Math.floor(Date.now() / 1000)))
        .catch(() => {});
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [configured, client]);

  const refetch = () => {
    base.refetch();
    challenge.refetch();
    reigns.refetch();
    mine.refetch();
  };

  const data: ThroneData | null = b
    ? {
        ticker: b[0],
        minReign: b[1],
        bond: b[2],
        quorum: b[3],
        reignCount: b[4],
        ethAccrued: b[5],
        ethClaimed: b[6],
        tokenAccrued: b[7],
        tokenClaimed: b[8],
        poolId: b[9],
        totalSupply: b[10],
        feeBps: poolConfig.data ? Number((poolConfig.data as readonly [Hex, number, bigint, boolean])[1]) : null,
        challenge: liveId > 0n && challenge.data ? (challenge.data as Challenge) : null,
        reigns: ((reigns.data as readonly (readonly [Address, bigint, bigint, number])[] | undefined) ?? []).map(
          ([controller, from, to, ended]) => ({ controller, from, to, ended }),
        ),
        owedEth: (mine.data as bigint[] | undefined)?.[0] ?? 0n,
        owedToken: (mine.data as bigint[] | undefined)?.[1] ?? 0n,
        myReigningStake: (mine.data as bigint[] | undefined)?.[2] ?? 0n,
        myChallengerStake: (mine.data as bigint[] | undefined)?.[3] ?? 0n,
        blockTime,
      }
    : null;

  return { data, error: base.error ?? challenge.error ?? reigns.error ?? null, isLoading: base.isLoading, refetch };
}

/** The chain's clock, ticking once a second, anchored to the latest block when one has been read. */
export function useNow(offset: number | null) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now + (offset ?? 0);
}

export type TxPhase = "idle" | "wallet" | "mining" | "done" | "error";
export type TxState = { phase: TxPhase; hash?: Hex; message?: string };

/** One transaction's lifecycle: wallet prompt, mining, confirmation, error. One instance per control. */
export function useTx(onConfirmed?: () => void) {
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const live = useRef(true);
  useEffect(() => () => void (live.current = false), []);
  type Request = Omit<Parameters<typeof writeContractAsync>[0], "value" | "args" | "abi"> & {
    abi: readonly unknown[];
    args?: readonly unknown[];
    value?: bigint;
  };
  const run = async (request: Request) => {
    if (state.phase === "wallet" || state.phase === "mining") return;
    setState({ phase: "wallet" });
    try {
      const hash = await writeContractAsync(request as unknown as Parameters<typeof writeContractAsync>[0]);
      if (!live.current) return;
      setState({ phase: "mining", hash });
      if (client) await client.waitForTransactionReceipt({ hash });
      if (!live.current) return;
      setState({ phase: "done", hash });
      onConfirmed?.();
    } catch (error) {
      if (live.current) setState({ phase: "error", message: errorText(error) });
    }
  };
  return { state, run, busy: state.phase === "wallet" || state.phase === "mining", reset: () => setState({ phase: "idle" }) };
}
