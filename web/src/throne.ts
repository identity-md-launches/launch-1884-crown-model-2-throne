/** Pure derivations of throne state from contract reads, kept free of React so they can be unit tested. */
import type { Address, Hex } from "viem";

export type TickerState = {
  token: Address;
  beneficiary: Address;
  reignStarted: bigint;
  cooldownUntil: bigint;
  liveChallenge: bigint;
};

export type Challenge = {
  ticker: Hex;
  candidate: Address;
  openedAt: bigint;
  votingEnds: bigint;
  finalizableAt: bigint;
  reigningStake: bigint;
  challengerStake: bigint;
  finalized: boolean;
  challengerWon: boolean;
  loserRefundPool: bigint;
  winnerBonusPool: bigint;
  initialTreasury: bigint;
  principalClaimed: bigint;
  payoutsClaimed: bigint;
};

export type Reign = { controller: Address; from: bigint; to: bigint; ended: number };

export type Phase =
  | { kind: "open"; eligibleAt: number; eligible: boolean }
  | { kind: "voting"; endsAt: number }
  | { kind: "timelock"; finalizableAt: number }
  | { kind: "finalizable"; since: number };

/** Which stage the ticker is in at `now` (unix seconds). */
export function phaseOf(ticker: TickerState, challenge: Challenge | null, minReign: bigint, now: number): Phase {
  if (challenge && ticker.liveChallenge !== 0n && !challenge.finalized) {
    if (now < Number(challenge.votingEnds)) return { kind: "voting", endsAt: Number(challenge.votingEnds) };
    if (now < Number(challenge.finalizableAt)) return { kind: "timelock", finalizableAt: Number(challenge.finalizableAt) };
    return { kind: "finalizable", since: Number(challenge.finalizableAt) };
  }
  const reignReady = ticker.reignStarted + minReign;
  const eligibleAt = Number(reignReady > ticker.cooldownUntil ? reignReady : ticker.cooldownUntil);
  return { kind: "open", eligibleAt, eligible: now >= eligibleAt };
}

/** Challenger wins only with strictly more stake and total stake at or above quorum. */
export function projectedOutcome(c: Challenge, quorum: bigint): { challengerLeads: boolean; quorumMet: boolean; total: bigint } {
  const total = c.reigningStake + c.challengerStake;
  return { challengerLeads: c.challengerStake > c.reigningStake, quorumMet: total >= quorum, total };
}

/** Share of the bar given to the reigning side, in whole percent, 50 when nothing is staked. */
export function reigningShare(c: Challenge): number {
  const total = c.reigningStake + c.challengerStake;
  if (total === 0n) return 50;
  return Number((c.reigningStake * 10_000n) / total) / 100;
}

/**
 * The registry's exact wei convention for one wallet's payout after finalization.
 * Mirrors README "Exact wei convention"; the registry's `claimable` view is authoritative on chain.
 */
export function payoutFor(c: Challenge, reigningStake: bigint, challengerStake: bigint): bigint {
  if (!c.finalized) return 0n;
  const [winStake, loseStake, W, L] = c.challengerWon
    ? [challengerStake, reigningStake, c.challengerStake, c.reigningStake]
    : [reigningStake, challengerStake, c.reigningStake, c.challengerStake];
  let out = 0n;
  if (L > 0n && loseStake > 0n) out += (loseStake * c.loserRefundPool) / L;
  if (W > 0n && winStake > 0n) out += winStake + (winStake * c.winnerBonusPool) / W;
  return out;
}

export function isAddressLike(s: string): s is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(s.trim());
}
