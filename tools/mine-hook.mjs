import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const E = require("../site/vendor/ethers.umd.min.js");

export function mineHook(factory, registry, deployer, start = 0n) {
  for (const address of [factory, registry, deployer]) {
    if (!E.isAddress(address) || address === E.ZeroAddress) throw new Error("Supply actual nonzero deployment addresses.");
  }
  const artifact = JSON.parse(readFileSync(resolve(root, "out/CrownHook.sol/CrownHook.json")));
  const args = E.AbiCoder.defaultAbiCoder().encode(["address", "address"], [registry, deployer]);
  const initCodeHash = E.keccak256(E.concat([artifact.bytecode.object, args]));
  for (let i = start; i < start + 1_000_000n; ++i) {
    const salt = E.zeroPadValue(E.toBeHex(i), 32);
    const address = E.getCreate2Address(factory, salt, initCodeHash);
    if ((BigInt(address) & 0x3fffn) === 0x1044n) return { salt, address, initCodeHash, flags: "0x1044" };
  }
  throw new Error("No salt found in this million attempts; retry with a larger start value.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [factory, registry, deployer, start = "0"] = process.argv.slice(2);
  if (!factory || !registry || !deployer) throw new Error("Usage: node tools/mine-hook.mjs FACTORY REGISTRY DEPLOYER [START]");
  console.log(JSON.stringify(mineHook(factory, registry, deployer, BigInt(start)), null, 2));
}
