import { parseHTML } from "./vendor/linkedom.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const E = require("../site/vendor/ethers.umd.min.js");

/// Run the shipped browser application in a DOM, using the demo's real chain provider.
/// This verifies behavior and contract transactions; it is not a visual browser/screenshot test.
export async function checkSite(root, provider, config) {
  const { window, document } = parseHTML(readFileSync(resolve(root,"site/index.html"),"utf8"));
  const $ = id => document.getElementById(id);
  const location = new URL("http://localhost:8080/?demo=1");
  window.ethers = {...E, JsonRpcProvider:class { constructor() { return provider; } }};
  const context = createContext({window,document,location,URL,URLSearchParams,console,setTimeout,clearTimeout,
    setInterval:()=>0,clearInterval:()=>{},fetch:async path => ({ok:true,json:async()=>JSON.parse(readFileSync(resolve(root,"site",path),"utf8"))})});
  runInContext(readFileSync(resolve(root,"site/app.js"),"utf8"),context,{filename:"site/app.js"});
  async function until(predicate,label) {
    const end = Date.now()+15000;
    while (Date.now()<end) {
      if (predicate()) return;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    throw new Error(`${label}: ${$("notice").textContent}; ${$("tx-status").textContent}`);
  }
  async function complete(label, action, expected) {
    const oldBlock = $("last-block").textContent;
    action();
    await until(()=>$("tx-status").textContent === `${label} confirmed.` && $("last-block").textContent !== oldBlock && !$("connect").disabled, label);
    if (expected) expected();
    console.log(`✓ Site: ${label}`);
  }
  function submit(id) { $(id).dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true})); }
  function select(id,value) {
    const options = [...$(id).querySelectorAll("option")];
    options.forEach(option => option.removeAttribute("selected"));
    options.find(option => option.value === value).selected = true;
  }
  await until(()=>$("dynasty-count").textContent === "2 reigns","Load real chain state");
  assert.equal($("pool-id").textContent,config.poolId);
  assert.equal($("controller").textContent,config.accounts[1]);
  assert.equal($("beneficiary").textContent,config.accounts[1]);
  assert.equal($("dynasty-count").textContent,"2 reigns");
  assert.equal($("timeline").children.length,2);
  assert.equal($("demo-controls").hidden,false);
  assert.equal($("stake-form").querySelector("button").disabled,true);
  $("connect").click();
  await until(()=>$("tx-status").textContent.includes("Public wallet connections are disabled"),"Reject public wallet in local demo");
  console.log("✓ Site: canonical pool, current holder, fee totals and dynasty loaded");

  select("demo-account",config.accounts[0]);
  $("demo-connect").click();
  await until(()=>$("wallet-label").textContent.includes(config.accounts[0]),"Connect local payer");
  await until(()=>!$("challenge-form").querySelector("button").disabled,"Enable challenge");
  $("candidate-input").value=config.accounts[0];
  await complete("Open challenge",()=>submit("challenge-form"),()=>assert.equal($("live-challenge").hidden,false));
  $("stake-amount").value="0.05";
  select("side","1");
  await complete("Stake",()=>submit("stake-form"),()=>assert($("quorum").textContent.includes("quorum met")));
  assert.equal($("finalize").disabled,true);
  $("demo-advance").click();
  await until(()=>$("challenge-badge").textContent==="Timelock","Enter timelock");
  assert.equal($("stake-form").querySelector("button").disabled,true);
  assert.equal($("finalize").disabled,true);
  $("demo-advance").click();
  await until(()=>!$("finalize").disabled,"Complete timelock");
  await complete("Finalize challenge",()=>$("finalize").click(),()=>assert.equal($("controller").textContent,config.accounts[0]));
  await complete("Demo buy",()=>$("demo-buy").click());
  await until(()=>!$("claim-token").disabled,"Accrue token fee");
  await complete("Claim THRONE fees",()=>$("claim-token").click(),()=>assert.equal($("token-owed").textContent,"0"));
  await complete("Demo sell",()=>$("demo-sell").click());
  await until(()=>!$("claim-eth").disabled,"Accrue native fee");
  await complete("Claim ETH fees",()=>$("claim-eth").click(),()=>assert.equal($("eth-owed").textContent,"0"));
  $("refund-id").value="2";
  await complete("Claim stake refund",()=>submit("refund-form"));
  assert.equal($("dynasty-count").textContent,"3 reigns");
  assert.equal($("pool-id").textContent,config.poolId);
  assert.equal($("pool-token").textContent,config.token);
  console.log("✓ Site: full challenge, stake, timelock, finalize, buy/sell, fee claims and stake refund verified");
}
