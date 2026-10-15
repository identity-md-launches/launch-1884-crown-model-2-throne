import { useEffect, useState, type ReactNode } from "react";
import { getAddress, type Address } from "viem";
import { useAccount, useReadContract, useSwitchChain } from "wagmi";
import { ConnectSheet, ensureChain } from "./ConnectSheet";
import {
  NATIVE,
  SPEC,
  TICKER,
  TREASURY,
  chain,
  crownHookAbi,
  explorer,
  isConfigured,
  loadDeployment,
  throneRegistryAbi,
  type Deployment,
} from "./config";
import { amount, dateTime, errorText, parseEthInput, remaining, short } from "./format";
import { useNow, useThrone, useTx, type ThroneData, type TxState } from "./hooks";
import { isAddressLike, phaseOf, projectedOutcome, reigningShare } from "./throne";

/* ---------- small pieces ---------- */

function AddressLink({ address, full = false }: { address: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <span className="addr">
      <a className="mono" href={explorer.address(address)} target="_blank" rel="noopener noreferrer" title={address}>
        {full ? address : short(address)}
      </a>
      <button type="button" className="copy" onClick={copy} aria-label={`Copy address ${address}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

function TxNote({ state }: { state: TxState }) {
  const text =
    state.phase === "wallet"
      ? "Confirm the transaction in your wallet."
      : state.phase === "mining"
        ? "Sent. Waiting for the chain to confirm."
        : state.phase === "done"
          ? "Confirmed."
          : state.phase === "error"
            ? state.message
            : "";
  return (
    <p className={`note${state.phase === "error" ? " error" : ""}`} role="status">
      {text}
      {state.hash && state.phase !== "wallet" && (
        <>
          {" "}
          <a href={explorer.tx(state.hash)} target="_blank" rel="noopener noreferrer">
            View the transaction
          </a>
        </>
      )}
    </p>
  );
}

/**
 * Four-state action: connect, switch network, then the action itself. One control is shown at a time
 * and the transaction control is disabled whenever a prerequisite is not met.
 */
function Action({
  label,
  busyLabel,
  disabled,
  reason,
  onRun,
  state,
  onConnect,
  secondary,
}: {
  label: string;
  busyLabel: string;
  disabled?: boolean;
  reason?: string | null;
  onRun: () => void;
  state: TxState;
  onConnect: () => void;
  secondary?: boolean;
}) {
  const { isConnected, connector, chainId } = useAccount();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const busy = state.phase === "wallet" || state.phase === "mining";
  const cls = `cta full${secondary ? " ghost" : ""}`;
  if (!isConnected)
    return (
      <button type="button" className={cls} onClick={onConnect}>
        Connect wallet to {label.charAt(0).toLowerCase() + label.slice(1)}
      </button>
    );
  if (chainId !== chain.id)
    return (
      <>
        <button
          type="button"
          className={cls}
          disabled={switching}
          onClick={() => ensureChain(connector, switchChainAsync).catch((e) => setSwitchError(errorText(e)))}
        >
          {switching ? "Switching…" : `Switch to ${chain.name}`}
        </button>
        {switchError && <p className="note error" role="status">{switchError}</p>}
      </>
    );
  return (
    <>
      <button type="button" className={cls} disabled={disabled || busy} onClick={onRun} aria-busy={busy || undefined}>
        {busy ? busyLabel : label}
      </button>
      {reason && disabled && <p className="note">{reason}</p>}
      <TxNote state={state} />
    </>
  );
}

/* ---------- sections ---------- */

function ThroneCard({ t, dep, now, onConnect, refetch }: { t: ThroneData; dep: Deployment; now: number; onConnect: () => void; refetch: () => void }) {
  const { address } = useAccount();
  const claimEth = useTx(refetch);
  const claimToken = useTx(refetch);
  const hook = dep.hook as Address;
  return (
    <section className="throne" aria-labelledby="holder-title">
      <div>
        <h2 id="holder-title">Throne holder</h2>
        <p className="holder mono">
          <AddressLink address={t.ticker.beneficiary} full />
        </p>
        <p className="muted">
          Reign {t.reignCount.toString()}, since {dateTime(t.ticker.reignStarted)}. Controller and beneficiary are the same wallet: it
          receives every crown fee until it is dethroned.
        </p>
        <dl className="facts">
          <div><dt>Crown fee</dt><dd>{t.feeBps === null ? "…" : `${t.feeBps / 100}% of each swap`}</dd></div>
          <div><dt>Supply</dt><dd>{amount(t.totalSupply, 0)} THRONE, fixed</dd></div>
        </dl>
      </div>
      <div className="fees">
        <h3>Crown fees, all reigns</h3>
        <table className="fee-table">
          <thead><tr><th scope="col">Currency</th><th scope="col">Accrued</th><th scope="col">Claimed</th></tr></thead>
          <tbody>
            <tr><th scope="row">ETH</th><td>{amount(t.ethAccrued)}</td><td>{amount(t.ethClaimed)}</td></tr>
            <tr><th scope="row">THRONE</th><td>{amount(t.tokenAccrued)}</td><td>{amount(t.tokenClaimed)}</td></tr>
          </tbody>
        </table>
        <div className="claims">
          <h3>Your claimable fees</h3>
          {address ? (
            <>
              <div className="claim-row">
                <span><b>{amount(t.owedEth)}</b> ETH</span>
                <Action label="Claim ETH" busyLabel="Claiming…" disabled={t.owedEth === 0n} secondary state={claimEth.state} onConnect={onConnect}
                  onRun={() => claimEth.run({ address: hook, abi: crownHookAbi, functionName: "claim", args: [TICKER, NATIVE] })} />
              </div>
              <div className="claim-row">
                <span><b>{amount(t.owedToken)}</b> THRONE</span>
                <Action label="Claim THRONE" busyLabel="Claiming…" disabled={t.owedToken === 0n} secondary state={claimToken.state} onConnect={onConnect}
                  onRun={() => claimToken.run({ address: hook, abi: crownHookAbi, functionName: "claim", args: [TICKER, dep.token as Address] })} />
              </div>
              {t.owedEth === 0n && t.owedToken === 0n && <p className="note">Nothing to claim for {short(address)} yet. Fees accrue to the throne holder on every swap.</p>}
            </>
          ) : (
            <button type="button" className="cta ghost full" onClick={onConnect}>Connect wallet to see claimable fees</button>
          )}
        </div>
      </div>
      <p className="visually-hidden">Chain time {dateTime(now)}</p>
    </section>
  );
}

function Challenge({ t, dep, now, onConnect, refetch }: { t: ThroneData; dep: Deployment; now: number; onConnect: () => void; refetch: () => void }) {
  const registry = dep.registry as Address;
  const phase = phaseOf(t.ticker, t.challenge, t.minReign, now);
  const openTx = useTx(refetch);
  const stakeTx = useTx(refetch);
  const finalizeTx = useTx(refetch);
  const [candidate, setCandidate] = useState("");
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [side, setSide] = useState<"0" | "1">("1");
  const [stake, setStake] = useState("");
  const [stakeError, setStakeError] = useState<string | null>(null);
  const c = t.challenge;

  const openChallenge = () => {
    const v = candidate.trim();
    if (!isAddressLike(v)) return setCandidateError("Enter a wallet address: 0x followed by 40 hex characters.");
    const addr = getAddress(v);
    if (addr === NATIVE) return setCandidateError("The candidate cannot be the zero address.");
    if (addr.toLowerCase() === t.ticker.beneficiary.toLowerCase()) return setCandidateError("Choose a wallet other than the current throne holder.");
    setCandidateError(null);
    openTx.run({ address: registry, abi: throneRegistryAbi, functionName: "openChallenge", args: [TICKER, addr], value: t.bond });
  };
  const sendStake = () => {
    const parsed = parseEthInput(stake);
    if ("error" in parsed) return setStakeError(parsed.error);
    setStakeError(null);
    stakeTx.run({ address: registry, abi: throneRegistryAbi, functionName: "stake", args: [t.ticker.liveChallenge, Number(side)], value: parsed.wei });
  };

  const badge =
    phase.kind === "open" ? (phase.eligible ? "Open to challenge" : "Protected reign") : phase.kind === "voting" ? "Voting live" : phase.kind === "timelock" ? "Timelock" : "Ready to finalize";

  return (
    <section className="panel" aria-labelledby="challenge-title">
      <div className="row-between">
        <h2 id="challenge-title">Challenge the throne</h2>
        <span className="badge">{badge}</span>
      </div>

      {phase.kind === "open" && (
        <form onSubmit={(e) => { e.preventDefault(); openChallenge(); }} noValidate>
          <p className="muted">
            Name a new beneficiary and bond {amount(t.bond)} ETH. The bond becomes your first challenger stake. Voting runs {Number(SPEC.votingWindow / 3600n)} hours, then a {Number(SPEC.timelock / 3600n)}-hour timelock.
          </p>
          {!phase.eligible && (
            <p className="note">
              Next challenge opens {dateTime(phase.eligibleAt)}, in {remaining(phase.eligibleAt, now)}.
              {t.ticker.cooldownUntil > 0n && now < Number(t.ticker.cooldownUntil) ? " A failed challenge put the ticker in a 3-day cooldown." : ""}
            </p>
          )}
          <label htmlFor="candidate">Candidate beneficiary wallet</label>
          <input id="candidate" className="mono" value={candidate} onChange={(e) => setCandidate(e.target.value)} placeholder="0x1234…abcd"
            autoComplete="off" spellCheck={false} inputMode="text" aria-invalid={!!candidateError} aria-describedby={candidateError ? "candidate-error" : undefined} />
          {candidateError && <p id="candidate-error" className="note error">{candidateError}</p>}
          <Action label={`Open challenge for ${amount(t.bond)} ETH`} busyLabel="Opening challenge…" disabled={!phase.eligible}
            reason="This reign cannot be challenged yet." state={openTx.state} onRun={openChallenge} onConnect={onConnect} />
        </form>
      )}

      {c && phase.kind !== "open" && (() => {
        const o = projectedOutcome(c, t.quorum);
        return (
          <div>
            <p className="muted">Challenge {t.ticker.liveChallenge.toString()}. Candidate <AddressLink address={c.candidate} />.</p>
            <p className="count">
              <b>{phase.kind === "finalizable" ? "Timelock over" : remaining(phase.kind === "voting" ? phase.endsAt : phase.finalizableAt, now)}</b>
              <span className="muted">{phase.kind === "voting" ? " left to vote" : phase.kind === "timelock" ? " until anyone can finalize" : ". Anyone can finalize now."}</span>
            </p>
            <div className="stakes" aria-label="Stakes by side">
              <span>Reigning <b>{amount(c.reigningStake)} ETH</b></span>
              <span>Challenger <b>{amount(c.challengerStake)} ETH</b></span>
            </div>
            <div className="bar" role="img" aria-label={`Reigning side holds ${reigningShare(c)} percent of the stake`}>
              <i style={{ width: `${reigningShare(c)}%` }} />
            </div>
            <p className="muted">
              {amount(o.total)} of {amount(t.quorum)} ETH quorum{o.quorumMet ? " reached" : " needed"}. {o.challengerLeads ? "The challenger leads." : "The reigning side holds."}{" "}
              Voting ends {dateTime(c.votingEnds)}; finalize from {dateTime(c.finalizableAt)}.
            </p>
            {(t.myReigningStake > 0n || t.myChallengerStake > 0n) && (
              <p className="note">Your stake: {amount(t.myReigningStake)} ETH reigning, {amount(t.myChallengerStake)} ETH challenger.</p>
            )}
            {phase.kind === "voting" && (
              <form onSubmit={(e) => { e.preventDefault(); sendStake(); }} noValidate>
                <div className="grid2">
                  <div>
                    <label htmlFor="side">Side</label>
                    <select id="side" value={side} onChange={(e) => setSide(e.target.value as "0" | "1")}>
                      <option value="1">Challenger</option>
                      <option value="0">Reigning</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="stake">ETH to stake</label>
                    <input id="stake" value={stake} onChange={(e) => setStake(e.target.value)} placeholder="0.05" inputMode="decimal" autoComplete="off"
                      aria-invalid={!!stakeError} aria-describedby={stakeError ? "stake-error" : undefined} />
                  </div>
                </div>
                {stakeError && <p id="stake-error" className="note error">{stakeError}</p>}
                <p className="muted">Stakes lock until finalization. The losing side is slashed {SPEC.slashPercent}%; refunds are claimed, not pushed.</p>
                <Action label="Stake ETH" busyLabel="Staking…" state={stakeTx.state} onRun={sendStake} onConnect={onConnect} />
              </form>
            )}
            {phase.kind === "timelock" && <p className="note">Voting has closed. Stakes are locked until the timelock ends.</p>}
            {phase.kind === "finalizable" && (
              <Action label="Finalize challenge" busyLabel="Finalizing…" state={finalizeTx.state} onConnect={onConnect}
                onRun={() => finalizeTx.run({ address: registry, abi: throneRegistryAbi, functionName: "finalize", args: [t.ticker.liveChallenge] })} />
            )}
          </div>
        );
      })()}
    </section>
  );
}

function Refunds({ dep, onConnect, refetch }: { dep: Deployment; onConnect: () => void; refetch: () => void }) {
  const registry = dep.registry as Address;
  const { address } = useAccount();
  const [id, setId] = useState("");
  const [idError, setIdError] = useState<string | null>(null);
  const valid = /^[1-9]\d*$/.test(id.trim());
  const claimable = useReadContract({
    address: registry, abi: throneRegistryAbi, functionName: "claimable", args: [valid ? BigInt(id) : 0n, address ?? NATIVE],
    query: { enabled: valid && !!address },
  });
  const claimed = useReadContract({
    address: registry, abi: throneRegistryAbi, functionName: "stakeClaimed", args: [valid ? BigInt(id) : 0n, address ?? NATIVE],
    query: { enabled: valid && !!address },
  });
  const treasuryOwed = useReadContract({ address: registry, abi: throneRegistryAbi, functionName: "treasuryOwed", query: { refetchInterval: 30_000 } });
  const refundTx = useTx(() => { refetch(); claimable.refetch(); claimed.refetch(); });
  const treasuryTx = useTx(() => { refetch(); treasuryOwed.refetch(); });
  const run = () => {
    if (!valid) return setIdError("Enter the challenge number, for example 1.");
    setIdError(null);
    refundTx.run({ address: registry, abi: throneRegistryAbi, functionName: "claimStake", args: [BigInt(id)] });
  };
  const owed = (claimable.data as bigint | undefined) ?? 0n;
  return (
    <section className="panel" aria-labelledby="refund-title">
      <h2 id="refund-title">Recover a stake</h2>
      <p className="muted">After a challenge is finalized, each staker claims its own payout: principal plus a share of the slash for winners, 80% of principal for losers.</p>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} noValidate>
        <label htmlFor="challenge-id">Challenge number</label>
        <input id="challenge-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="1" inputMode="numeric" autoComplete="off"
          aria-invalid={!!idError} aria-describedby={idError ? "id-error" : "id-hint"} />
        {idError && <p id="id-error" className="note error">{idError}</p>}
        <p id="id-hint" className="note">
          {address && valid
            ? claimed.data
              ? "This stake was already claimed."
              : claimable.isFetched
                ? `Claimable now: ${amount(owed)} ETH.`
                : "Checking…"
            : "Connect a wallet and enter a challenge number to see what it can claim."}
        </p>
        <Action label="Claim stake payout" busyLabel="Claiming…" disabled={!valid || owed === 0n} reason={valid ? "Nothing to claim for this challenge yet." : undefined}
          state={refundTx.state} onRun={run} onConnect={onConnect} secondary />
      </form>
      <div className="treasury">
        <h3>Treasury</h3>
        <p className="muted">
          Slashed stake owed to the fixed treasury <AddressLink address={TREASURY} />: {amount((treasuryOwed.data as bigint | undefined) ?? 0n)} ETH. Anyone can trigger the payout.
        </p>
        <Action label="Pay treasury" busyLabel="Paying…" disabled={((treasuryOwed.data as bigint | undefined) ?? 0n) === 0n} reason="Nothing is owed to the treasury right now."
          state={treasuryTx.state} onConnect={onConnect} secondary
          onRun={() => treasuryTx.run({ address: registry, abi: throneRegistryAbi, functionName: "claimTreasury" })} />
      </div>
    </section>
  );
}

function History({ t, onMore }: { t: ThroneData; onMore: () => void }) {
  const list = [...t.reigns].reverse();
  const start = Number(t.reignCount) - t.reigns.length;
  return (
    <section aria-labelledby="history-title" className="history">
      <div className="row-between">
        <h2 id="history-title">Reign history</h2>
        <span className="badge">{t.reignCount.toString()} {t.reignCount === 1n ? "reign" : "reigns"}</span>
      </div>
      <ol className="timeline">
        {list.map((r, i) => (
          <li key={`${r.controller}-${r.from}`}>
            <span className="num">{start + list.length - i}</span>
            <AddressLink address={r.controller} />
            <span className="muted dates">{dateTime(r.from)} to {r.to === 0n ? "now" : dateTime(r.to)}</span>
            <span className={r.to === 0n ? "state current" : "state"}>{r.to === 0n ? "Reigning" : "Dethroned"}</span>
          </li>
        ))}
        {list.length === 0 && <li className="muted">No reign yet. The genesis reign appears once THRONE is registered.</li>}
      </ol>
      {start > 0 && <button type="button" className="cta ghost" onClick={onMore}>Show earlier reigns</button>}
    </section>
  );
}

function Pool({ t, dep }: { t: ThroneData; dep: Deployment }) {
  const rows: [string, ReactNode][] = [
    ["Token", <AddressLink address={dep.token as Address} full />],
    ["CrownHook", <AddressLink address={dep.hook as Address} full />],
    ["Registry", <AddressLink address={dep.registry as Address} full />],
  ];
  if (dep.poolManager) rows.push(["PoolManager", <AddressLink address={dep.poolManager} full />]);
  rows.push(["Pool id", <span className="mono">{t.poolId}</span>]);
  if (dep.poolKey) rows.push(["Pool key", <span>ETH / THRONE, LP fee {dep.poolKey.fee / 10_000}%, tick spacing {dep.poolKey.tickSpacing}</span>]);
  return (
    <section className="panel" aria-labelledby="pool-title" id="pool">
      <h2 id="pool-title">The one THRONE pool</h2>
      <p className="muted">
        One token, one canonical Uniswap v4 pool wearing CrownHook. Dethroning changes who earns the fees, never the token or the pool.
      </p>
      <dl className="facts">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <p className="links">
        {dep.chartUrl ? (
          <a href={dep.chartUrl} target="_blank" rel="noopener noreferrer">Open the canonical chart</a>
        ) : (
          <span className="muted">The chart link is published after the pool is indexed.</span>
        )}
      </p>
      {!dep.uniswap && (
        <p className="note">
          Swaps are not offered on this page: the network's vetted Uniswap router table for {chain.name} was not supplied. Trade in the pool through your own Uniswap v4 interface.
        </p>
      )}
    </section>
  );
}

function HowItWorks({ t }: { t: ThroneData | null }) {
  const minReign = t?.minReign ?? 0n;
  return (
    <section aria-labelledby="how-title" className="how">
      <h2 id="how-title">How the throne works</h2>
      <ol className="steps">
        <li>
          <h3>One token, forever</h3>
          <p>The registry binds the THRONE ticker to one token contract once. Nobody can replace the token, change its supply or move its pool.</p>
        </li>
        <li>
          <h3>Fees flow to the throne</h3>
          <p>CrownHook takes {SPEC.defaultFeeBps / 100}% of every swap in the pool and credits it to the current throne holder, backed one to one by a claim on the PoolManager. The holder withdraws with Claim.</p>
        </li>
        <li>
          <h3>Anyone can challenge</h3>
          <p>Bond {amount(SPEC.bond)} ETH and name a candidate wallet. For {Number(SPEC.votingWindow / 3600n)} hours anyone stakes ETH on the reigning or challenger side. Stakes stay locked.</p>
        </li>
        <li>
          <h3>The vote settles</h3>
          <p>After a {Number(SPEC.timelock / 3600n)}-hour timelock anyone finalizes. The challenger wins with strictly more stake and at least {amount(SPEC.quorum)} ETH staked in total. Ties and missed quorum keep the throne.</p>
        </li>
        <li>
          <h3>Winners and losers settle up</h3>
          <p>The losing side loses {SPEC.slashPercent}%: half goes pro rata to winning stakers, half to the treasury. Everyone claims their own payout. A failed challenge starts a {Number(SPEC.failedCooldown / 86400n)}-day cooldown.</p>
        </li>
      </ol>
      <p className="muted fine">
        {minReign === 0n
          ? "This registry has a minimum reign of zero, so a fresh reign can be challenged at once. The production default in the code is seven days."
          : `A new reign is protected for ${Number(minReign / 86400n)} days before it can be challenged.`}{" "}
        Earned fees stay with the wallet that earned them after a dethrone.
      </p>
    </section>
  );
}

/* ---------- page ---------- */

export function App() {
  const [dep, setDep] = useState<Deployment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [reignLimit, setReignLimit] = useState(20);
  const { address } = useAccount();
  useEffect(() => {
    loadDeployment().then(setDep).catch((e) => setLoadError(errorText(e)));
  }, []);
  const configured = isConfigured(dep);
  const { data, error, isLoading, refetch } = useThrone(dep, address, reignLimit);
  const now = useNow(data?.blockTime ?? null);
  const openConnect = () => setSheet(true);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <a className="brand" href="./" aria-label="THRONE home">
          <svg viewBox="0 0 32 28" aria-hidden="true" width="22" height="20"><path d="M3 7l7 6 6-11 6 11 7-6-3 16H6zM6 27h20" /></svg>
          THRONE
        </a>
        <div className="top-right">
          <span className="net"><i aria-hidden="true" />{chain.name}</span>
          <ConnectSheet open={sheet} onOpenChange={setSheet} />
        </div>
      </header>

      <main id="main">
        <section className="hero">
          <h1>One token. Every reign.</h1>
          <p>One permanent token on {chain.name}. Its swap fees go to whoever holds the throne.</p>
        </section>

        <p className="status" role="status">
          {loadError
            ? `Unable to load the deployment configuration: ${loadError}`
            : dep && !configured
              ? "Not launched yet. Addresses and controls go live when the launch publishes them."
              : error
                ? `Unable to read the chain: ${errorText(error)}`
                : isLoading
                  ? "Reading the throne from the chain…"
                  : data
                    ? `Live on ${chain.name}. Verify the token and pool addresses before you trade.`
                    : ""}
        </p>

        {configured && data ? (
          <>
            <ThroneCard t={data} dep={dep} now={now} onConnect={openConnect} refetch={refetch} />
            <div className="two">
              <Challenge t={data} dep={dep} now={now} onConnect={openConnect} refetch={refetch} />
              <Refunds dep={dep} onConnect={openConnect} refetch={refetch} />
            </div>
            <History t={data} onMore={() => setReignLimit((n) => n + 20)} />
            <Pool t={data} dep={dep} />
          </>
        ) : (
          <section className="throne placeholder" aria-labelledby="holder-title">
            <div>
              <h2 id="holder-title">Throne holder</h2>
              <p className="holder mono">{configured ? "…" : "Awaiting launch"}</p>
              <p className="muted">Holder, crown fees and the live challenge are read from the contracts once deployed.</p>
            </div>
            <div className="fees">
              <h3>Crown fees, all reigns</h3>
              <table className="fee-table">
                <thead><tr><th scope="col">Currency</th><th scope="col">Accrued</th><th scope="col">Claimed</th></tr></thead>
                <tbody>
                  <tr><th scope="row">ETH</th><td>0</td><td>0</td></tr>
                  <tr><th scope="row">THRONE</th><td>0</td><td>0</td></tr>
                </tbody>
              </table>
              <div className="claims">
                <h3>Your claimable fees</h3>
                {address ? <p className="note">Claims open when the contracts are published.</p> : <button type="button" className="cta ghost full" onClick={openConnect}>Connect wallet</button>}
              </div>
            </div>
          </section>
        )}
        <HowItWorks t={data} />
      </main>
      <footer>
        <span>THRONE, Crown Model 2</span>
        <span className="muted">{data ? `Reads refresh every 12 seconds from ${chain.name}.` : `Chain ${chain.id}. Treasury ${short(TREASURY)}.`}</span>
      </footer>
    </>
  );
}
