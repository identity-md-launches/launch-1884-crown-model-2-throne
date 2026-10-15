// Generated from the accepted build (out/CrownHook.sol/CrownHook.json via site/abi.json). Do not edit by hand.
export const crownHookAbi = [
 {
  "type": "constructor",
  "inputs": [
   {
    "name": "registry_",
    "type": "address",
    "internalType": "contract IThroneRegistry"
   },
   {
    "name": "deployer_",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "receive",
  "stateMutability": "payable"
 },
 {
  "type": "function",
  "name": "DEFAULT_FEE_BPS",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint16",
    "internalType": "uint16"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "MAX_FEE_BPS",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint16",
    "internalType": "uint16"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "REGISTRY_READ_GAS",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "REQUIRED_FLAGS",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint160",
    "internalType": "uint160"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "afterInitialize",
  "inputs": [
   {
    "name": "sender",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "key",
    "type": "tuple",
    "internalType": "struct PoolKey",
    "components": [
     {
      "name": "currency0",
      "type": "address",
      "internalType": "Currency"
     },
     {
      "name": "currency1",
      "type": "address",
      "internalType": "Currency"
     },
     {
      "name": "fee",
      "type": "uint24",
      "internalType": "uint24"
     },
     {
      "name": "tickSpacing",
      "type": "int24",
      "internalType": "int24"
     },
     {
      "name": "hooks",
      "type": "address",
      "internalType": "contract IHooks"
     }
    ]
   },
   {
    "name": "sqrtPriceX96",
    "type": "uint160",
    "internalType": "uint160"
   },
   {
    "name": "",
    "type": "int24",
    "internalType": "int24"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bytes4",
    "internalType": "bytes4"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "afterSwap",
  "inputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "key",
    "type": "tuple",
    "internalType": "struct PoolKey",
    "components": [
     {
      "name": "currency0",
      "type": "address",
      "internalType": "Currency"
     },
     {
      "name": "currency1",
      "type": "address",
      "internalType": "Currency"
     },
     {
      "name": "fee",
      "type": "uint24",
      "internalType": "uint24"
     },
     {
      "name": "tickSpacing",
      "type": "int24",
      "internalType": "int24"
     },
     {
      "name": "hooks",
      "type": "address",
      "internalType": "contract IHooks"
     }
    ]
   },
   {
    "name": "params",
    "type": "tuple",
    "internalType": "struct IPoolManager.SwapParams",
    "components": [
     {
      "name": "zeroForOne",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "amountSpecified",
      "type": "int256",
      "internalType": "int256"
     },
     {
      "name": "sqrtPriceLimitX96",
      "type": "uint160",
      "internalType": "uint160"
     }
    ]
   },
   {
    "name": "delta",
    "type": "int256",
    "internalType": "BalanceDelta"
   },
   {
    "name": "",
    "type": "bytes",
    "internalType": "bytes"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bytes4",
    "internalType": "bytes4"
   },
   {
    "name": "",
    "type": "int128",
    "internalType": "int128"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "canonicalPool",
  "inputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "PoolId"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "claim",
  "inputs": [
   {
    "name": "currency",
    "type": "address",
    "internalType": "Currency"
   }
  ],
  "outputs": [
   {
    "name": "amount",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "claim",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "currency",
    "type": "address",
    "internalType": "Currency"
   }
  ],
  "outputs": [
   {
    "name": "amount",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "configurePoolManager",
  "inputs": [
   {
    "name": "manager",
    "type": "address",
    "internalType": "contract IPoolManager"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "crownClaimed",
  "inputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "",
    "type": "address",
    "internalType": "Currency"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "crownOwed",
  "inputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "",
    "type": "address",
    "internalType": "Currency"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "crownPaid",
  "inputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "",
    "type": "address",
    "internalType": "Currency"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "deployer",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "getHookPermissions",
  "inputs": [],
  "outputs": [
   {
    "name": "p",
    "type": "tuple",
    "internalType": "struct Hooks.Permissions",
    "components": [
     {
      "name": "beforeInitialize",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "afterInitialize",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "beforeAddLiquidity",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "afterAddLiquidity",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "beforeRemoveLiquidity",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "afterRemoveLiquidity",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "beforeSwap",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "afterSwap",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "beforeDonate",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "afterDonate",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "beforeSwapReturnDelta",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "afterSwapReturnDelta",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "afterAddLiquidityReturnDelta",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "afterRemoveLiquidityReturnDelta",
      "type": "bool",
      "internalType": "bool"
     }
    ]
   }
  ],
  "stateMutability": "pure"
 },
 {
  "type": "function",
  "name": "hasCanonicalPool",
  "inputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "owedByTicker",
  "inputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "",
    "type": "address",
    "internalType": "Currency"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "pendingTickers",
  "inputs": [
   {
    "name": "recipient",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "currency",
    "type": "address",
    "internalType": "Currency"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bytes32[]",
    "internalType": "bytes32[]"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "poolConfig",
  "inputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "PoolId"
   }
  ],
  "outputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "feeBps",
    "type": "uint16",
    "internalType": "uint16"
   },
   {
    "name": "initialSqrtPriceX96",
    "type": "uint160",
    "internalType": "uint160"
   },
   {
    "name": "initialized",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "poolManager",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "contract IPoolManager"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "poolTicker",
  "inputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "PoolId"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "registerPool",
  "inputs": [
   {
    "name": "key",
    "type": "tuple",
    "internalType": "struct PoolKey",
    "components": [
     {
      "name": "currency0",
      "type": "address",
      "internalType": "Currency"
     },
     {
      "name": "currency1",
      "type": "address",
      "internalType": "Currency"
     },
     {
      "name": "fee",
      "type": "uint24",
      "internalType": "uint24"
     },
     {
      "name": "tickSpacing",
      "type": "int24",
      "internalType": "int24"
     },
     {
      "name": "hooks",
      "type": "address",
      "internalType": "contract IHooks"
     }
    ]
   },
   {
    "name": "ticker",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "initialSqrtPriceX96",
    "type": "uint160",
    "internalType": "uint160"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "registerPool",
  "inputs": [
   {
    "name": "key",
    "type": "tuple",
    "internalType": "struct PoolKey",
    "components": [
     {
      "name": "currency0",
      "type": "address",
      "internalType": "Currency"
     },
     {
      "name": "currency1",
      "type": "address",
      "internalType": "Currency"
     },
     {
      "name": "fee",
      "type": "uint24",
      "internalType": "uint24"
     },
     {
      "name": "tickSpacing",
      "type": "int24",
      "internalType": "int24"
     },
     {
      "name": "hooks",
      "type": "address",
      "internalType": "contract IHooks"
     }
    ]
   },
   {
    "name": "ticker",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "feeBps",
    "type": "uint16",
    "internalType": "uint16"
   },
   {
    "name": "initialSqrtPriceX96",
    "type": "uint160",
    "internalType": "uint160"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "registry",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "contract IThroneRegistry"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "unlockCallback",
  "inputs": [
   {
    "name": "data",
    "type": "bytes",
    "internalType": "bytes"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bytes",
    "internalType": "bytes"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "event",
  "name": "CrownAccrued",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "indexed": true,
    "internalType": "bytes32"
   },
   {
    "name": "beneficiary",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "currency",
    "type": "address",
    "indexed": true,
    "internalType": "Currency"
   },
   {
    "name": "amount",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "CrownClaimed",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "indexed": true,
    "internalType": "bytes32"
   },
   {
    "name": "beneficiary",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "currency",
    "type": "address",
    "indexed": true,
    "internalType": "Currency"
   },
   {
    "name": "amount",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "PoolBound",
  "inputs": [
   {
    "name": "poolId",
    "type": "bytes32",
    "indexed": true,
    "internalType": "PoolId"
   },
   {
    "name": "ticker",
    "type": "bytes32",
    "indexed": true,
    "internalType": "bytes32"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "PoolManagerConfigured",
  "inputs": [
   {
    "name": "manager",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "PoolRegistered",
  "inputs": [
   {
    "name": "poolId",
    "type": "bytes32",
    "indexed": true,
    "internalType": "PoolId"
   },
   {
    "name": "ticker",
    "type": "bytes32",
    "indexed": true,
    "internalType": "bytes32"
   },
   {
    "name": "feeBps",
    "type": "uint16",
    "indexed": false,
    "internalType": "uint16"
   }
  ],
  "anonymous": false
 },
 {
  "type": "error",
  "name": "AlreadyConfigured",
  "inputs": []
 },
 {
  "type": "error",
  "name": "FeeOutOfRange",
  "inputs": []
 },
 {
  "type": "error",
  "name": "InvalidAddress",
  "inputs": []
 },
 {
  "type": "error",
  "name": "InvalidPool",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotConfigured",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NothingToClaim",
  "inputs": []
 },
 {
  "type": "error",
  "name": "OnlyDeployer",
  "inputs": []
 },
 {
  "type": "error",
  "name": "OnlyPoolManager",
  "inputs": []
 },
 {
  "type": "error",
  "name": "PoolAlreadyRegistered",
  "inputs": []
 },
 {
  "type": "error",
  "name": "Reentrancy",
  "inputs": []
 },
 {
  "type": "error",
  "name": "UnexpectedCallback",
  "inputs": []
 },
 {
  "type": "error",
  "name": "UnexpectedInitialization",
  "inputs": []
 }
] as const;
