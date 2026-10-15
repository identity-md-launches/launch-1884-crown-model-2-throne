import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve, dirname, extname, sep } from "node:path";
import assert from "node:assert/strict";
import { mineHook } from "./mine-hook.mjs";
import { LocalProvider, localRequest } from "./local-provider.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const require = createRequire(import.meta.url);
const E = require("../site/vendor/ethers.umd.min.js");
const serve = process.argv.includes("--serve");
const portArg = process.argv.indexOf("--port");
const port = portArg < 0 ? 8545 : Number(process.argv[portArg + 1]);
const siteArg = process.argv.indexOf("--site-port");
const sitePort = siteArg < 0 ? 8080 : Number(process.argv[siteArg + 1]);
for (const value of [port, sitePort]) assert(Number.isInteger(value) && value > 1024 && value < 65536, "Use an unprivileged TCP port.");
const rpcUrl = `http://127.0.0.1:${port}`;
const CHAIN_ID = 4663;
const TICKER = E.id("THRONE");
const ETH = E.ZeroAddress;
const receipts = [];
let anvil, server, provider;

function artifact(name) {
  return JSON.parse(readFileSync(resolve(root, "out", `${name}.sol`, `${name}.json`)));
}
function cleanup() {
  provider?.destroy(); server?.close(); anvil?.kill("SIGTERM");
}
process.once("SIGINT", () => { cleanup(); process.exit(0); });
process.once("SIGTERM", () => { cleanup(); process.exit(0); });

async function send(label, transaction) {
  const tx = await transaction;
  const receipt = await tx.wait();
  assert.equal(receipt.status, 1, label);
  receipts.push({ step:label, hash:receipt.hash, block:receipt.blockNumber, gasUsed:String(receipt.gasUsed) });
  console.log(`✓ ${label}`);
  return receipt;
}
async function deploy(name, signer, args = []) {
  const compiled = artifact(name);
  const contract = await new E.ContractFactory(compiled.abi, compiled.bytecode.object, signer).deploy(...args);
  await send(`Deploy ${name}`, Promise.resolve(contract.deploymentTransaction()));
  return contract;
}
async function startup() {
  const build = spawnSync("forge", ["build"], {cwd:root, stdio:["ignore", "pipe", "pipe"]});
  if (build.status !== 0) throw new Error(`forge build failed: ${build.stderr?.toString()} ${build.stdout?.toString()}`);
  const abi = Object.fromEntries(["ThroneRegistry", "CrownHook", "ThroneToken", "CrownHookFactory", "PoolManager", "DemoRouter"].map(name => [name, artifact(name).abi]));
  writeFileSync(resolve(root, "site/abi.json"), JSON.stringify(abi) + "\n");
  // No keys, mnemonic, wallet files or environment variables are read. Only this fresh local node is used.
  anvil = spawn("anvil", ["--host", "127.0.0.1", "--port", String(port), "--chain-id", String(CHAIN_ID), "--hardfork", "cancun", "--silent"], {cwd:root, stdio:["ignore", "ignore", "pipe"]});
  let startupError;
  let startupStderr = "";
  anvil.stderr.on("data", chunk => { startupStderr = (startupStderr + chunk.toString()).slice(-4000); });
  anvil.on("error", error => { startupError = error; });
  for (let attempt = 0; attempt < 50; ++attempt) {
    if (startupError || anvil.exitCode !== null) throw startupError || new Error(`Anvil could not start: ${startupStderr}`);
    try {
      const [result] = await localRequest(port, {jsonrpc:"2.0",id:1,method:"web3_clientVersion",params:[]});
      if (result.result?.toLowerCase().includes("anvil")) break;
    } catch {}
    if (attempt === 49) throw new Error("Fresh local Anvil did not become ready within five seconds.");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  provider = new LocalProvider(port, CHAIN_ID);
  // Refuse to use an already active node; all demo deployments belong to the fresh child process.
  assert.equal(await provider.getBlockNumber(), 0, "The demo requires a fresh Anvil chain.");
  assert.equal((await provider.getNetwork()).chainId, BigInt(CHAIN_ID));
  return abi;
}

async function main() {
  const abi = await startup();
  const payer = await provider.getSigner(0), successor = await provider.getSigner(1), trader = await provider.getSigner(2);
  const payerAddress = await payer.getAddress(), successorAddress = await successor.getAddress(), traderAddress = await trader.getAddress();
  const registry = await deploy("ThroneRegistry", payer, [0]);
  const token = await deploy("ThroneToken", payer, [payerAddress, E.parseEther("1000000000")]);
  const manager = await deploy("PoolManager", payer, [payerAddress]);
  const factory = await deploy("CrownHookFactory", payer);
  const registryAddress = await registry.getAddress(), tokenAddress = await token.getAddress(), managerAddress = await manager.getAddress();
  const mined = mineHook(await factory.getAddress(), registryAddress, payerAddress);
  assert.equal(await factory.predict(registryAddress, payerAddress, mined.salt), mined.address);
  await send("Deploy CrownHook at its mined permission address", factory.deploy(registryAddress, payerAddress, mined.salt));
  const hook = new E.Contract(mined.address, abi.CrownHook, payer);
  const router = await deploy("DemoRouter", payer, [managerAddress]);
  const routerAddress = await router.getAddress();
  await send("Register the THRONE genesis reign", registry.registerTicker(TICKER, tokenAddress, payerAddress));
  await send("Set the local PoolManager once", hook.configurePoolManager(managerAddress));
  const key = [ETH, tokenAddress, 3000, 60, mined.address];
  const price = 1n << 96n;
  await send("Register the immutable pool and default 100 bps fee", hook["registerPool((address,address,uint24,int24,address),bytes32,uint160)"](key, TICKER, price));
  await send("Initialize the canonical pool", manager.initialize(key, price));
  await send("Approve exact liquidity allowance", token.approve(routerAddress, E.parseEther("100")));
  await send("Seed real Uniswap v4 liquidity", router.liquidity(key, [-887220,887220,E.parseEther("100"),E.ZeroHash], {value:E.parseEther("101")}));
  await send("Fund the local trader with THRONE", token.transfer(traderAddress, E.parseEther("1000")));
  await send("Approve local sell amount", token.connect(trader).approve(routerAddress, E.parseEther("1")));
  const poolId = await hook.canonicalPool(TICKER);
  const originalToken = await registry.token(TICKER);
  const buy = () => router.connect(trader).swap(key, [true,-E.parseEther("1"),4295128740n], {value:E.parseEther("1")});
  await send("Buy before the challenge", buy());
  const genesisTokenFees = await hook.crownOwed(payerAddress, tokenAddress);
  assert(genesisTokenFees > 0n);
  await send("Open bonded challenge naming the second beneficiary", registry.connect(successor).openChallenge(TICKER, successorAddress, {value:E.parseEther("0.01")}));
  const id = await registry.challengeCount();
  await send("Stake 0.05 ETH for the challenger", registry.connect(successor).stake(id, 1, {value:E.parseEther("0.05")}));
  await send("Stake 0.02 ETH for the reigning side", registry.stake(id, 0, {value:E.parseEther("0.02")}));
  await send("Sell during the live challenge, accruing native ETH fees", router.connect(trader).swap(key, [false,-E.parseEther("1"),1461446703485210103287273052203988822378723970341n]));
  const genesisEthFees = await hook.crownOwed(payerAddress, ETH);
  assert(genesisEthFees > 0n);
  await send("Claim token fees while voting is live", hook["claim(address)"](tokenAddress));
  await send("Claim native ETH fees while voting is live", hook["claim(address)"](ETH));
  const challenge = await registry.challenges(id);
  await provider.send("evm_setNextBlockTimestamp", [Number(challenge.finalizableAt)]);
  await provider.send("evm_mine", []);
  await send("Finalize after the simulated 72h vote plus 24h timelock", registry.connect(trader).finalize(id));
  assert.equal(await registry.beneficiary(TICKER), successorAddress);
  assert.equal(await registry.controller(TICKER), successorAddress);
  await send("Buy after the dethrone", buy());
  const successorTokenFees = await hook.crownOwed(successorAddress, tokenAddress);
  assert(successorTokenFees > 0n);
  assert.equal(await hook.crownOwed(payerAddress, tokenAddress), 0n);
  assert.equal(await hook.crownPaid(TICKER, tokenAddress), genesisTokenFees + successorTokenFees);
  await send("Second beneficiary claims the new fee stream", hook.connect(successor)["claim(address)"](tokenAddress));
  assert.equal(await hook.crownPaid(TICKER, tokenAddress), await hook.crownClaimed(TICKER, tokenAddress));
  assert.equal(await manager.balanceOf(mined.address, BigInt(tokenAddress)), 0n);
  assert.equal(await manager.balanceOf(mined.address, 0), 0n);
  assert.equal(await registry.claimable(id, payerAddress), E.parseEther("0.016"));
  assert.equal(await registry.claimable(id, successorAddress), E.parseEther("0.062"));
  await send("Losing side claims its 80% refund", registry.claimStake(id));
  await send("Winning side claims stake and its pro-rata slash reward", registry.connect(successor).claimStake(id));
  await send("Pay the fixed treasury its 0.002 ETH share", registry.claimTreasury());
  assert.equal(await provider.getBalance(registryAddress), 0n);
  assert.equal(await registry.token(TICKER), originalToken);
  assert.equal(await hook.canonicalPool(TICKER), poolId);
  assert.equal(await registry.reignCount(TICKER), 2n);

  const config = { local:true,chainId:CHAIN_ID,chainName:"Local Crown demo",rpcUrl,explorerUrl:null,
    registry:registryAddress,hook:mined.address,token:tokenAddress,poolManager:managerAddress,poolId,poolKey:key,
    chartUrl:null,deploymentBlock:1,demoRouter:routerAddress,accounts:[payerAddress,successorAddress,traderAddress] };
  writeFileSync(resolve(root, "site/deployment.local.json"), JSON.stringify(config,null,2)+"\n");
  const evidence = {scope:"Local Anvil simulation only; not a Robinhood Chain deployment",chainId:CHAIN_ID,
    secondBeneficiary:{name:"Second beneficiary (Anvil account #1)",address:successorAddress},genesisBeneficiary:payerAddress,
    token:tokenAddress,poolId,registry:registryAddress,hook:mined.address,hookSalt:mined.salt,
    compiler:"0.8.26",timing:"Advanced local EVM time by the full 72-hour voting window and 24-hour timelock",
    genesisTokenFeesWei:String(genesisTokenFees),genesisEthFeesWei:String(genesisEthFees),successorTokenFeesWei:String(successorTokenFees),
    tokenUnchanged:true,poolUnchanged:true,reignCount:2,allAccrualsClaimed:true,registryBalanceWei:"0",receipts};
  writeFileSync(resolve(root, "docs/demo-evidence.json"), JSON.stringify(evidence,null,2)+"\n");
  console.log(`\nLocal end-to-end demo passed. Second beneficiary: ${successorAddress}`);
  console.log("Evidence: docs/demo-evidence.json");
  if (process.argv.includes("--check-ui")) {
    const {checkSite} = await import("./check-site.mjs");
    await checkSite(root,provider,config);
  }
  if (!serve) { cleanup(); return; }
  const siteRoot = resolve(root,"site");
  const types = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8"};
  server = createServer((request,response) => {
    const url = new URL(request.url,"http://localhost");
    const file = resolve(siteRoot,"." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(siteRoot + sep) || !existsSync(file)) { response.writeHead(404); response.end("Not found"); return; }
    try { response.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream","cache-control":"no-store"}); response.end(readFileSync(file)); }
    catch { response.writeHead(404); response.end("Not found"); }
  });
  await new Promise((resolve,reject) => { server.once("error",reject); server.listen(sitePort,"127.0.0.1",resolve); });
  console.log(`Site: http://127.0.0.1:${sitePort}/?demo=1\nRPC: ${rpcUrl}\nUse the local demo account controls at the bottom of the page. Ctrl-C stops both servers.`);
}

main().catch(error => { console.error(error.shortMessage || error.message); cleanup(); process.exitCode=1; });
