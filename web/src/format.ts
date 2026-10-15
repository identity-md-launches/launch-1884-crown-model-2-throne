import { formatEther } from "viem";

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Wei to a readable amount: thousands separators, at most six decimals, "<0.000001" for dust. */
export function amount(wei: bigint, maxDecimals = 6): string {
  if (wei > 0n && wei < 10n ** BigInt(18 - maxDecimals)) return `<${(1 / 10 ** maxDecimals).toFixed(maxDecimals)}`;
  const [whole, fraction = ""] = formatEther(wei).split(".");
  const decimals = fraction.slice(0, maxDecimals).replace(/0+$/, "");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (decimals ? `.${decimals}` : "");
}

export function dateTime(seconds: bigint | number): string {
  return new Date(Number(seconds) * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Remaining time as "2d 03h 14m" style text; "0m" once the deadline has passed. */
export function remaining(end: bigint | number, now: number): string {
  let s = Math.max(0, Number(end) - now);
  const days = Math.floor(s / 86400);
  s %= 86400;
  const hours = Math.floor(s / 3600);
  s %= 3600;
  const minutes = Math.floor(s / 60);
  s %= 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${minutes}m ${String(s).padStart(2, "0")}s`;
}

/** Validate a decimal ETH amount typed by the visitor; returns wei or an instruction to fix the input. */
export function parseEthInput(text: string): { wei: bigint } | { error: string } {
  const t = text.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return { error: "Enter an ETH amount such as 0.05, with at most 18 decimals." };
  const [whole, fraction = ""] = t.split(".");
  const wei = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
  if (wei <= 0n) return { error: "Enter an amount greater than zero." };
  return { wei };
}

/** Turn a wallet or contract error into one plain sentence. */
export function errorText(error: unknown): string {
  const e = error as { shortMessage?: string; message?: string; code?: number; cause?: { message?: string } };
  const raw = e?.shortMessage || e?.cause?.message || e?.message || String(error);
  if (/user rejected|user denied|rejected the request/i.test(raw)) return "You rejected the request in your wallet. Nothing was sent.";
  if (/insufficient funds/i.test(raw)) return "Your wallet does not hold enough ETH for this amount plus gas.";
  const names: Record<string, string> = {
    ReignTooYoung: "This reign is still protected by the minimum reign. Wait until it can be challenged.",
    CooldownActive: "A failed challenge put this ticker in cooldown. Wait for it to end.",
    ChallengeLive: "A challenge is already live for this ticker. Stake in it instead.",
    WrongBond: "The challenge bond must be exactly 0.01 ETH.",
    VotingClosed: "Voting has closed for this challenge.",
    NotFinalizable: "The timelock has not passed yet. Finalize after it ends.",
    AlreadyFinalized: "This challenge is already finalized.",
    NothingToClaim: "There is nothing to claim for this wallet.",
    NotFinalized: "This challenge has not been finalized yet.",
    AlreadyClaimed: "This stake was already claimed.",
  };
  for (const [name, text] of Object.entries(names)) if (raw.includes(name)) return text;
  const m = raw.match(/reverted with the following reason:\s*([^\n]+)/i) || raw.match(/Error: (\w+)\(/);
  return m ? `The contract rejected this: ${m[1]}` : raw.split("\n")[0].slice(0, 200);
}
