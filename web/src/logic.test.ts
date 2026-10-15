import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { amount, errorText, parseEthInput, remaining, short } from "./format";
import { payoutFor, phaseOf, projectedOutcome, reigningShare, type Challenge, type TickerState } from "./throne";
import { TICKER, WALLET_ADD_CHAIN, isConfigured, loadDeployment } from "./config";

const A = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const B = "0xf19F11Dee16a341671E6Ed3e209b704C1Bbc3E57" as const;

describe("formatting", () => {
  it("formats wei with separators and at most six decimals", () => {
    expect(amount(parseEther("1234.5678901"))).toBe("1,234.56789");
    expect(amount(0n)).toBe("0");
    expect(amount(1n)).toBe("<0.000001");
    expect(amount(parseEther("1000000000"), 0)).toBe("1,000,000,000");
  });
  it("shortens addresses", () => expect(short(A)).toBe("0x7099…79C8"));
  it("parses ETH input and rejects bad values with an instruction", () => {
    expect(parseEthInput(" 0.05 ")).toEqual({ wei: parseEther("0.05") });
    expect(parseEthInput("0")).toHaveProperty("error");
    expect(parseEthInput("1e3")).toHaveProperty("error");
    expect(parseEthInput("abc")).toHaveProperty("error");
  });
  it("counts down", () => {
    expect(remaining(1000 + 2 * 86400 + 3 * 3600 + 4 * 60, 1000)).toBe("2d 03h 04m");
    expect(remaining(1000 + 65, 1000)).toBe("1m 05s");
    expect(remaining(10, 1000)).toBe("0m 00s");
  });
  it("translates wallet and contract errors", () => {
    expect(errorText(new Error("User rejected the request."))).toMatch(/rejected/);
    expect(errorText(new Error('reverted with custom error "WrongBond()"'))).toMatch(/0\.01 ETH/);
    expect(errorText({ shortMessage: "insufficient funds for gas" })).toMatch(/enough ETH/);
  });
});

const ticker = (over: Partial<TickerState> = {}): TickerState => ({
  token: A,
  beneficiary: B,
  reignStarted: 1_000n,
  cooldownUntil: 0n,
  liveChallenge: 0n,
  ...over,
});
const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  ticker: TICKER,
  candidate: A,
  openedAt: 2_000n,
  votingEnds: 2_000n + 72n * 3600n,
  finalizableAt: 2_000n + 96n * 3600n,
  reigningStake: 0n,
  challengerStake: parseEther("0.01"),
  finalized: false,
  challengerWon: false,
  loserRefundPool: 0n,
  winnerBonusPool: 0n,
  initialTreasury: 0n,
  principalClaimed: 0n,
  payoutsClaimed: 0n,
  ...over,
});

describe("phases", () => {
  it("is open at once with MIN_REIGN 0 and protected with 7 days", () => {
    expect(phaseOf(ticker(), null, 0n, 1_001)).toEqual({ kind: "open", eligibleAt: 1000, eligible: true });
    const p = phaseOf(ticker(), null, 7n * 86400n, 1_001);
    expect(p).toMatchObject({ kind: "open", eligible: false, eligibleAt: 1000 + 7 * 86400 });
  });
  it("respects the failed-challenge cooldown", () => {
    const p = phaseOf(ticker({ cooldownUntil: 50_000n }), null, 0n, 10_000);
    expect(p).toMatchObject({ kind: "open", eligible: false, eligibleAt: 50_000 });
  });
  it("walks voting, timelock and finalizable", () => {
    const t = ticker({ liveChallenge: 1n });
    const c = challenge();
    expect(phaseOf(t, c, 0n, 2_001).kind).toBe("voting");
    expect(phaseOf(t, c, 0n, Number(c.votingEnds)).kind).toBe("timelock");
    expect(phaseOf(t, c, 0n, Number(c.finalizableAt)).kind).toBe("finalizable");
  });
});

describe("challenge math", () => {
  it("requires strictly more stake and quorum", () => {
    const q = parseEther("0.05");
    expect(projectedOutcome(challenge({ challengerStake: parseEther("0.03"), reigningStake: parseEther("0.02") }), q)).toMatchObject({ challengerLeads: true, quorumMet: true });
    expect(projectedOutcome(challenge({ challengerStake: parseEther("0.02"), reigningStake: parseEther("0.02") }), q).challengerLeads).toBe(false);
    expect(projectedOutcome(challenge({ challengerStake: parseEther("0.03"), reigningStake: 0n }), q).quorumMet).toBe(false);
  });
  it("splits the bar", () => {
    expect(reigningShare(challenge({ reigningStake: parseEther("0.02"), challengerStake: parseEther("0.06") }))).toBe(25);
    expect(reigningShare(challenge({ reigningStake: 0n, challengerStake: 0n }))).toBe(50);
  });
  it("matches the README wei convention for the 0.06 vs 0.02 example", () => {
    const L = parseEther("0.02");
    const slash = L / 5n;
    const c = challenge({
      finalized: true,
      challengerWon: true,
      reigningStake: L,
      challengerStake: parseEther("0.06"),
      loserRefundPool: L - slash,
      winnerBonusPool: slash / 2n,
      initialTreasury: slash - slash / 2n,
    });
    expect(payoutFor(c, L, 0n)).toBe(parseEther("0.016"));
    expect(payoutFor(c, 0n, parseEther("0.06"))).toBe(parseEther("0.062"));
    expect(c.initialTreasury).toBe(parseEther("0.002"));
  });
});

describe("configuration", () => {
  it("offers the chain to wallets with the project's public values only", () => {
    expect(WALLET_ADD_CHAIN).toEqual({
      chainId: "0x1237",
      chainName: "Robinhood Chain",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
      blockExplorerUrls: ["https://robin.etherscan.io"],
    });
  });
  it("reads an unconfigured deployment.json as not configured", async () => {
    const f = (async (url: string) =>
      url.endsWith("deployment.json") && !url.includes("imd-")
        ? new Response(JSON.stringify({ chainId: 4663, registry: null, hook: null, token: null }))
        : new Response("", { status: 404 })) as unknown as typeof fetch;
    const d = await loadDeployment(f);
    expect(d.source).toBe("deployment.json");
    expect(isConfigured(d)).toBe(false);
  });
  it("prefers a workflow handoff manifest and rejects zero or malformed addresses", async () => {
    const manifest = {
      version: 1,
      chainId: 4663,
      contracts: [
        { name: "ThroneRegistry", address: A },
        { name: "CrownHook", address: B },
        { name: "ThroneToken", address: "0x0000000000000000000000000000000000000000" },
      ],
      poolKey: { currency0: "0x0000000000000000000000000000000000000000", currency1: A, fee: 3000, tickSpacing: 60, hooks: B },
    };
    const f = (async (url: string) =>
      url.endsWith("imd-deployment.json")
        ? new Response(JSON.stringify(manifest))
        : new Response(JSON.stringify({ manifest: "imd-deployment.json" }))) as unknown as typeof fetch;
    const d = await loadDeployment(f);
    expect(d.source).toBe("imd-deployment.json");
    expect(d.registry).toBe(A);
    expect(d.token).toBeNull();
    expect(isConfigured(d)).toBe(false);
    expect(d.poolKey).toMatchObject({ fee: 3000, tickSpacing: 60, hooks: B });
  });
});
