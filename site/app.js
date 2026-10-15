/* Static, locally vendored client. All amounts passed to contracts remain bigint wei. */
"use strict";

const $ = (id) => document.getElementById(id);
const E = window.ethers;
const TICKER = E.id("THRONE");
const NATIVE = E.ZeroAddress; // Uniswap v4's specified native-currency identifier, not a recipient.
let config, abi, provider, registry, hook, signer, account, snapshot;
let busy = false, refreshing = false, loadedReigns = 20;
let chainTime = 0, sampledAt = 0;

function short(address) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }
function date(seconds) { return new Date(Number(seconds) * 1000).toLocaleString(); }
function amount(wei) {
  const [whole, fraction = ""] = E.formatEther(wei).split(".");
  const decimals = fraction.slice(0, 6).replace(/0+$/, "");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (decimals ? `.${decimals}` : "");
}
function value(id, wei) {
  $(id).textContent = wei > 0n && wei < 1_000_000_000_000n ? "<0.000001" : amount(wei);
  $(id).title = `${E.formatEther(wei)} (${wei} wei)`;
}
function safeUrl(url) {
  try { const parsed = new URL(url); return parsed.protocol === "https:" ? parsed.href : null; }
  catch { return null; }
}
function addressLink(id, address, full = false) {
  const el = $(id);
  el.textContent = full ? address : short(address);
  el.title = address;
  el.removeAttribute("aria-disabled");
  if (config.explorerUrl && safeUrl(config.explorerUrl)) {
    el.href = `${config.explorerUrl}/address/${address}`;
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  }
}
function message(text, error = false) {
  $("tx-status").hidden = false;
  $("tx-status").textContent = text;
  $("tx-status").classList.toggle("error", error);
}
function errorText(error) {
  return error?.revert?.name || error?.shortMessage || error?.reason || error?.message || String(error);
}
function now() { return chainTime + Math.floor((Date.now() - sampledAt) / 1000); }
function remaining(end) {
  let seconds = Math.max(0, Number(end) - now());
  const days = Math.floor(seconds / 86400); seconds %= 86400;
  const hours = Math.floor(seconds / 3600); seconds %= 3600;
  const minutes = Math.floor(seconds / 60); seconds %= 60;
  return `${days ? `${days}d ` : ""}${hours}h ${minutes}m ${seconds}s`;
}
function etherInput(id) {
  const text = $(id).value.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(text)) throw new Error("Enter an ETH amount with at most 18 decimal places.");
  const wei = E.parseEther(text);
  if (wei <= 0n) throw new Error("The amount must be greater than zero.");
  return wei;
}

function updateControls() {
  const ready = !!signer && !!snapshot && !busy;
  $("connect").disabled = busy;
  $("challenge-form").querySelector("button").disabled = !ready;
  $("stake-form").querySelector("button").disabled = !ready;
  $("refund-form").querySelector("button").disabled = !ready;
  $("claim-eth").disabled = !ready || snapshot?.ethOwed === 0n;
  $("claim-token").disabled = !ready || snapshot?.tokenOwed === 0n;
  $("finalize").disabled = true;
  if (!snapshot) return;
  const { ticker, challenge, minReign } = snapshot;
  if (challenge) {
    const voting = now() < Number(challenge.votingEnds);
    const finalizable = now() >= Number(challenge.finalizableAt);
    $("challenge-badge").textContent = voting ? "Voting live" : finalizable ? "Ready to finalize" : "Timelock";
    $("countdown").textContent = finalizable ? "Ready" : remaining(voting ? challenge.votingEnds : challenge.finalizableAt);
    $("countdown-label").textContent = voting ? "remaining in the vote" : finalizable ? "anyone can finalize" : "until finalization";
    $("stake-form").querySelector("button").disabled = !ready || !voting;
    $("finalize").disabled = !ready || !finalizable;
  } else {
    const eligibleAt = Number(ticker.reignStarted + minReign > ticker.cooldownUntil ? ticker.reignStarted + minReign : ticker.cooldownUntil);
    const eligible = now() >= eligibleAt;
    $("challenge-badge").textContent = eligible ? "Open to challenge" : "Protected reign";
    $("eligibility").textContent = eligible ? "Anyone can nominate a new beneficiary. The bond is subject to the same outcome as challenger stakes." : `Next challenge available ${date(eligibleAt)} · ${remaining(eligibleAt)} remaining.`;
    $("challenge-form").querySelector("button").disabled = !ready || !eligible;
  }
}

async function verifyDeployment() {
  for (const field of ["registry", "hook", "token", "poolManager"]) {
    if (!E.isAddress(config[field]) || config[field] === NATIVE) throw new Error(`Deployment is not configured: ${field}.`);
    if (await provider.getCode(config[field]) === "0x") throw new Error(`No ${field} contract on the selected chain.`);
  }
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(config.chainId)) throw new Error("RPC chain ID does not match the deployment.");
  const [token, hookRegistry, manager, pool, boundTicker] = await Promise.all([
    registry.token(TICKER), hook.registry(), hook.poolManager(), hook.canonicalPool(TICKER), hook.poolTicker(config.poolId)
  ]);
  if (token.toLowerCase() !== config.token.toLowerCase() || hookRegistry.toLowerCase() !== config.registry.toLowerCase()
      || manager.toLowerCase() !== config.poolManager.toLowerCase() || pool !== config.poolId || boundTicker !== TICKER) {
    throw new Error("Deployment configuration does not match the immutable token and canonical pool on chain.");
  }
  const computedPool = E.keccak256(E.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint24", "int24", "address"], config.poolKey
  ));
  if (computedPool !== pool || config.poolKey[0] !== NATIVE || config.poolKey[1].toLowerCase() !== token.toLowerCase()) {
    throw new Error("Pool key does not describe the canonical native ETH / THRONE pool.");
  }
}

async function loadDynasty(count) {
  const start = Math.max(0, Number(count) - loadedReigns);
  const entries = await Promise.all(Array.from({length: Number(count) - start}, (_, i) => registry.reigns(TICKER, start + i)));
  const list = $("timeline"); list.replaceChildren();
  for (let i = entries.length - 1; i >= 0; --i) {
    const reign = entries[i];
    const row = document.createElement("li");
    const number = document.createElement("span"); number.className = "number"; number.textContent = String(start + i + 1).padStart(2, "0");
    const holder = document.createElement("a"); holder.className = "address"; holder.textContent = short(reign.controller); holder.title = reign.controller;
    if (safeUrl(config.explorerUrl)) { holder.href = `${config.explorerUrl}/address/${reign.controller}`; holder.target = "_blank"; holder.rel = "noopener noreferrer"; }
    const dates = document.createElement("span"); dates.className = "dates"; dates.textContent = `${date(reign.from)} → ${reign.to === 0n ? "present" : date(reign.to)}`;
    const ended = document.createElement("span"); ended.className = `ended ${reign.to === 0n ? "current" : ""}`; ended.textContent = reign.to === 0n ? "Reigning ●" : "Dethroned";
    row.append(number, holder, dates, ended); list.append(row);
  }
  $("more-reigns").hidden = start === 0;
  $("dynasty-count").textContent = `${count} ${count === 1n ? "reign" : "reigns"}`;
}

async function refresh() {
  if (!registry || refreshing) return;
  refreshing = true;
  try {
    const [block, ticker, minReign, count, ethPaid, ethClaimed, tokenPaid, tokenClaimed, settings] = await Promise.all([
      provider.getBlock("latest"), registry.tickerState(TICKER), registry.MIN_REIGN(), registry.reignCount(TICKER),
      hook.crownPaid(TICKER, NATIVE), hook.crownClaimed(TICKER, NATIVE),
      hook.crownPaid(TICKER, config.token), hook.crownClaimed(TICKER, config.token), hook.poolConfig(config.poolId)
    ]);
    chainTime = block.timestamp; sampledAt = Date.now();
    const challenge = ticker.liveChallenge === 0n ? null : await registry.challenges(ticker.liveChallenge);
    const [ethOwed, tokenOwed] = account ? await Promise.all([
      hook.owedByTicker(TICKER, account, NATIVE), hook.owedByTicker(TICKER, account, config.token)
    ]) : [0n, 0n];
    snapshot = { ticker, minReign, challenge, ethOwed, tokenOwed, count };
    addressLink("holder", ticker.beneficiary);
    $("controller").textContent = ticker.beneficiary;
    $("beneficiary").textContent = ticker.beneficiary;
    $("reign-number").textContent = `#${count}`;
    $("reign-since").textContent = date(ticker.reignStarted);
    value("eth-accrued", ethPaid); value("eth-claimed", ethClaimed);
    value("token-accrued", tokenPaid); value("token-claimed", tokenClaimed);
    value("eth-owed", ethOwed); value("token-owed", tokenOwed);
    $("fee-rate").textContent = `${Number(settings.feeBps) / 100}%`;
    $("last-block").textContent = `Updated at block ${block.number}`;
    $("live-challenge").hidden = !challenge;
    $("challenge-form").hidden = !!challenge;
    $("eligibility").hidden = !!challenge;
    if (challenge) {
      addressLink("candidate", challenge.candidate);
      $("challenge-summary").textContent = `Challenge #${ticker.liveChallenge} · staked ETH decides the next reign.`;
      $("reigning-stake").textContent = `${amount(challenge.reigningStake)} ETH`;
      $("challenger-stake").textContent = `${amount(challenge.challengerStake)} ETH`;
      const total = challenge.reigningStake + challenge.challengerStake;
      $("stake-bar").style.width = `${Number(challenge.reigningStake * 10000n / total) / 100}%`;
      $("quorum").textContent = `${amount(total)} / 0.05 ETH quorum · ${total >= E.parseEther("0.05") ? "quorum met" : "more participation needed"}`;
      $("vote-dates").textContent = `Voting ends ${date(challenge.votingEnds)}. Finalize from ${date(challenge.finalizableAt)}.`;
      $("refund-id").value ||= String(ticker.liveChallenge);
    } else $("challenge-summary").textContent = "A bonded stake-vote decides who earns the next fees.";
    await loadDynasty(count);
    updateControls();
  } catch (error) {
    snapshot = null; updateControls();
    message(`Could not refresh chain state: ${errorText(error)}`, true);
  } finally { refreshing = false; }
}

async function ensureSigner() {
  if (!signer) throw new Error("Connect a wallet first.");
  const network = await signer.provider.getNetwork();
  if (network.chainId !== BigInt(config.chainId)) throw new Error(`Switch your wallet to ${config.chainName}.`);
  return signer;
}
async function transact(label, send) {
  if (busy) return;
  busy = true; updateControls();
  try {
    await ensureSigner();
    message(`${label}: confirm the transaction in your wallet.`);
    const tx = await send();
    message(`${label}: waiting for confirmation (${short(tx.hash)}).`);
    await tx.wait();
    message(`${label} confirmed.`);
    if (safeUrl(config.explorerUrl)) {
      const link = document.createElement("a"); link.href = `${config.explorerUrl}/tx/${tx.hash}`;
      link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = " View transaction ↗";
      $("tx-status").append(link);
    }
    await refresh();
  } catch (error) { message(`${label}: ${errorText(error)}`, true); }
  finally { busy = false; updateControls(); }
}

async function connect() {
  try {
    if (!config?.registry) throw new Error("This site is awaiting deployment configuration. Start the local demo to try it now.");
    if (config.local) {
      $("demo-controls").scrollIntoView?.({behavior:"smooth"});
      message("Use the local demo account selector below. Public wallet connections are disabled in this local chain-4663 simulation.");
      return;
    }
    if (!window.ethereum) throw new Error("Open this page with an Ethereum wallet extension, or use the local demo accounts.");
    const chainId = E.toQuantity(config.chainId);
    try { await window.ethereum.request({method:"wallet_switchEthereumChain", params:[{chainId}]}); }
    catch (error) {
      if (error.code !== 4902 || config.local) throw error;
      await window.ethereum.request({method:"wallet_addEthereumChain", params:[{
        chainId, chainName:config.chainName, nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},
        rpcUrls:[config.rpcUrl], blockExplorerUrls:[config.explorerUrl]
      }]});
    }
    await window.ethereum.request({method:"eth_requestAccounts"});
    signer = await new E.BrowserProvider(window.ethereum).getSigner();
    account = await signer.getAddress();
    $("connect").textContent = short(account); $("wallet-label").textContent = `Connected: ${account}`;
    await refresh();
  } catch (error) { message(errorText(error), true); }
}

$("connect").addEventListener("click", connect);
$("challenge-form").addEventListener("submit", (event) => {
  event.preventDefault();
  transact("Open challenge", async () => {
    const candidate = E.getAddress($("candidate-input").value.trim());
    if (candidate === NATIVE || candidate === snapshot.ticker.beneficiary) throw new Error("Choose a nonzero wallet different from the current beneficiary.");
    return registry.connect(signer).openChallenge(TICKER, candidate, {value:E.parseEther("0.01")});
  });
});
$("stake-form").addEventListener("submit", (event) => {
  event.preventDefault();
  transact("Stake", () => {
    const side = Number($("side").value);
    if (side !== 0 && side !== 1) throw new Error("Select the reigning or challenger side.");
    return registry.connect(signer).stake(snapshot.ticker.liveChallenge, side, {value:etherInput("stake-amount")});
  });
});
$("finalize").addEventListener("click", () => transact("Finalize challenge", () => registry.connect(signer).finalize(snapshot.ticker.liveChallenge)));
$("claim-eth").addEventListener("click", () => transact("Claim ETH fees", () => hook.connect(signer)["claim(bytes32,address)"](TICKER, NATIVE)));
$("claim-token").addEventListener("click", () => transact("Claim THRONE fees", () => hook.connect(signer)["claim(bytes32,address)"](TICKER, config.token)));
$("refund-form").addEventListener("submit", (event) => {
  event.preventDefault();
  transact("Claim stake refund", () => {
    const id = $("refund-id").value.trim();
    if (!/^[1-9]\d*$/.test(id)) throw new Error("Enter a positive challenge ID.");
    return registry.connect(signer).claimStake(BigInt(id));
  });
});
$("more-reigns").addEventListener("click", () => { loadedReigns += 20; refresh(); });

async function setupDemo() {
  if (!config.local) return;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) throw new Error("Local demo mode is available only on localhost.");
  if (!(await provider.send("web3_clientVersion", [])).toLowerCase().includes("anvil")) throw new Error("Local demo controls require Anvil.");
  $("demo-controls").hidden = false;
  const roles = ["Launch payer", "Second beneficiary", "Trader"];
  config.accounts.forEach((address, i) => {
    const option = document.createElement("option"); option.value = address; option.textContent = `${roles[i] || "Account"} · ${short(address)}`;
    $("demo-account").append(option);
  });
  $("demo-connect").addEventListener("click", async () => {
    signer = await provider.getSigner($("demo-account").value); account = await signer.getAddress();
    $("connect").textContent = short(account); $("wallet-label").textContent = `Local demo wallet: ${account}`;
    await refresh();
  });
  $("demo-advance").addEventListener("click", async () => {
    try {
      let target;
      if (snapshot.challenge) target = now() < Number(snapshot.challenge.votingEnds) ? snapshot.challenge.votingEnds : snapshot.challenge.finalizableAt;
      else target = snapshot.ticker.reignStarted + snapshot.minReign > snapshot.ticker.cooldownUntil ? snapshot.ticker.reignStarted + snapshot.minReign : snapshot.ticker.cooldownUntil;
      if (Number(target) <= now()) throw new Error("No future deadline is pending. Open or finalize a challenge.");
      await provider.send("evm_setNextBlockTimestamp", [Number(target)]); await provider.send("evm_mine", []);
      await refresh(); message("Local chain advanced to the next deadline.");
    } catch (error) { message(errorText(error), true); }
  });
  $("demo-buy").addEventListener("click", () => transact("Demo buy", () => {
    const router = new E.Contract(config.demoRouter, abi.DemoRouter, signer);
    return router.swap(config.poolKey, [true, -E.parseEther("0.01"), 4295128740n], {value:E.parseEther("0.01")});
  }));
  $("demo-sell").addEventListener("click", () => transact("Demo sell", async () => {
    const token = new E.Contract(config.token, abi.ThroneToken, signer);
    const amount = E.parseEther("0.01");
    if (await token.allowance(account, config.demoRouter) < amount) await (await token.approve(config.demoRouter, amount)).wait();
    return new E.Contract(config.demoRouter, abi.DemoRouter, signer).swap(config.poolKey,
      [false, -amount, 1461446703485210103287273052203988822378723970341n]);
  }));
}

(async function init() {
  try {
    const local = new URLSearchParams(location.search).get("demo") === "1";
    const responses = await Promise.all([fetch(local ? "deployment.local.json" : "deployment.json"), fetch("abi.json")]);
    if (responses.some((r) => !r.ok)) throw new Error("Deployment files are missing. Run the local demo or configure deployment.json.");
    [config, abi] = await Promise.all(responses.map((r) => r.json()));
    if (config.local && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
      throw new Error("Local deployment configuration may only run on localhost.");
    }
    $("network").textContent = config.local ? "Local demo · chain 4663" : config.chainName;
    if (!config.registry) {
      $("notice").textContent = "Ready for launch. No public deployment is configured yet. Run node tools/demo.mjs --serve, then open /?demo=1 to explore the complete local demo.";
      return;
    }
    provider = new E.JsonRpcProvider(config.rpcUrl);
    registry = new E.Contract(config.registry, abi.ThroneRegistry, provider);
    hook = new E.Contract(config.hook, abi.CrownHook, provider);
    await verifyDeployment();
    const supply = await new E.Contract(config.token, abi.ThroneToken, provider).totalSupply();
    $("token-supply").textContent = `${amount(supply)} THRONE · fixed forever`;
    addressLink("token-link", config.token); $("token-link").textContent = "Token ↗";
    addressLink("pool-token", config.token, true); addressLink("pool-manager", config.poolManager, true);
    addressLink("pool-hook", config.hook, true); addressLink("pool-registry", config.registry, true);
    $("pool-id").textContent = config.poolId;
    $("pool-key").textContent = `Native ETH / THRONE · LP fee ${Number(config.poolKey[2]) / 10000}% · tick spacing ${config.poolKey[3]}`;
    if (safeUrl(config.chartUrl)) {
      $("chart-link").href = config.chartUrl; $("chart-link").textContent = "Canonical chart ↗";
      $("chart-link").target = "_blank"; $("chart-link").rel = "noopener noreferrer";
      $("chart-link").removeAttribute("aria-disabled");
    }
    $("notice").textContent = config.local ? "Local demo: real Uniswap v4 contracts on an isolated Anvil chain. Time advances are simulated; no public-chain transactions were sent." : "Live on Robinhood Chain. Verify the token and canonical pool addresses before transacting.";
    await setupDemo();
    if (config.local) $("connect").textContent = "Use demo account ↓";
    await refresh();
    setInterval(refresh, 12000); setInterval(updateControls, 1000);
  } catch (error) {
    registry = null; signer = null; snapshot = null;
    $("notice").textContent = errorText(error); $("notice").classList.add("error"); updateControls();
  }
})();

if (window.ethereum?.on) {
  const resetWallet = () => { if (config?.local) return; signer = null; account = null; $("connect").textContent = "Connect wallet ↗"; $("wallet-label").textContent = "Wallet changed. Connect again to continue."; refresh(); };
  window.ethereum.on("accountsChanged", resetWallet);
  window.ethereum.on("chainChanged", resetWallet);
}
