import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const names = ["ThroneRegistry", "CrownHook", "ThroneToken", "CrownHookFactory", "PoolManager", "DemoRouter"];
const abi = Object.fromEntries(names.map(name => [name,
  JSON.parse(readFileSync(resolve(root, "out", `${name}.sol`, `${name}.json`))).abi
]));
writeFileSync(resolve(root, "site/abi.json"), JSON.stringify(abi) + "\n");
console.log("Exported locally compiled contract ABIs to site/abi.json.");
