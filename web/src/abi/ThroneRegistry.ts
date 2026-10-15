// Generated from the accepted build (out/ThroneRegistry.sol/ThroneRegistry.json via site/abi.json). Do not edit by hand.
export const throneRegistryAbi = [
 {
  "type": "constructor",
  "inputs": [
   {
    "name": "minReign_",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "BOND",
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
  "name": "DEFAULT_MIN_REIGN",
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
  "name": "FAILED_COOLDOWN",
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
  "name": "MIN_REIGN",
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
  "name": "QUORUM",
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
  "name": "TIMELOCK",
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
  "name": "TREASURY",
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
  "name": "VOTING_WINDOW",
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
  "name": "beneficiary",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
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
  "name": "challengeCount",
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
  "name": "challenges",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "tuple",
    "internalType": "struct ThroneRegistry.Challenge",
    "components": [
     {
      "name": "ticker",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "candidate",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "openedAt",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "votingEnds",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "finalizableAt",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "reigningStake",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "challengerStake",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "finalized",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "challengerWon",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "loserRefundPool",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "winnerBonusPool",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "initialTreasury",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "principalClaimed",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "payoutsClaimed",
      "type": "uint256",
      "internalType": "uint256"
     }
    ]
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "claimStake",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
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
  "name": "claimTreasury",
  "inputs": [],
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
  "name": "claimable",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "staker",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "amount",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "controller",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
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
  "name": "finalize",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "openChallenge",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "candidate",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "payable"
 },
 {
  "type": "function",
  "name": "registerTicker",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "token_",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "beneficiary_",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "reignCount",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "internalType": "bytes32"
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
  "name": "reigns",
  "inputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "controller",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "from",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "to",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "ended",
    "type": "uint8",
    "internalType": "enum ThroneRegistry.EndReason"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "stake",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "side",
    "type": "uint8",
    "internalType": "enum ThroneRegistry.Side"
   }
  ],
  "outputs": [],
  "stateMutability": "payable"
 },
 {
  "type": "function",
  "name": "stakeClaimed",
  "inputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "",
    "type": "address",
    "internalType": "address"
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
  "name": "stakes",
  "inputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "",
    "type": "uint8",
    "internalType": "enum ThroneRegistry.Side"
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
  "name": "tickerId",
  "inputs": [
   {
    "name": "symbol",
    "type": "string",
    "internalType": "string"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "pure"
 },
 {
  "type": "function",
  "name": "tickerOfToken",
  "inputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
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
  "name": "tickerStakeTotals",
  "inputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "",
    "type": "uint8",
    "internalType": "enum ThroneRegistry.Side"
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
  "name": "tickerState",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "tuple",
    "internalType": "struct ThroneRegistry.Ticker",
    "components": [
     {
      "name": "token",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "beneficiary",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "reignStarted",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "cooldownUntil",
      "type": "uint256",
      "internalType": "uint256"
     },
     {
      "name": "liveChallenge",
      "type": "uint256",
      "internalType": "uint256"
     }
    ]
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "token",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
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
  "name": "treasuryOwed",
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
  "name": "treasuryPaid",
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
  "type": "event",
  "name": "ChallengeFailed",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "indexed": true,
    "internalType": "bytes32"
   },
   {
    "name": "challengeId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "cooldownUntil",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "ChallengeOpened",
  "inputs": [
   {
    "name": "challengeId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "ticker",
    "type": "bytes32",
    "indexed": true,
    "internalType": "bytes32"
   },
   {
    "name": "candidate",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "opener",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   },
   {
    "name": "votingEnds",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "finalizableAt",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Dethroned",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "indexed": true,
    "internalType": "bytes32"
   },
   {
    "name": "challengeId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "previous",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   },
   {
    "name": "current",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "StakeClaimed",
  "inputs": [
   {
    "name": "challengeId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "staker",
    "type": "address",
    "indexed": true,
    "internalType": "address"
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
  "name": "Staked",
  "inputs": [
   {
    "name": "challengeId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "staker",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "side",
    "type": "uint8",
    "indexed": false,
    "internalType": "enum ThroneRegistry.Side"
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
  "name": "TickerRegistered",
  "inputs": [
   {
    "name": "ticker",
    "type": "bytes32",
    "indexed": true,
    "internalType": "bytes32"
   },
   {
    "name": "token",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "beneficiary",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "TreasuryClaimed",
  "inputs": [
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
  "type": "error",
  "name": "AlreadyFinalized",
  "inputs": []
 },
 {
  "type": "error",
  "name": "AlreadyRegistered",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ChallengeLive",
  "inputs": []
 },
 {
  "type": "error",
  "name": "CooldownActive",
  "inputs": []
 },
 {
  "type": "error",
  "name": "InvalidCandidate",
  "inputs": []
 },
 {
  "type": "error",
  "name": "InvalidRegistration",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotFinalized",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NothingToClaim",
  "inputs": []
 },
 {
  "type": "error",
  "name": "Reentrancy",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ReignTooYoung",
  "inputs": []
 },
 {
  "type": "error",
  "name": "TooEarly",
  "inputs": []
 },
 {
  "type": "error",
  "name": "TransferFailed",
  "inputs": []
 },
 {
  "type": "error",
  "name": "UnknownChallenge",
  "inputs": []
 },
 {
  "type": "error",
  "name": "UnknownTicker",
  "inputs": []
 },
 {
  "type": "error",
  "name": "VotingClosed",
  "inputs": []
 },
 {
  "type": "error",
  "name": "WrongBond",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ZeroStake",
  "inputs": []
 }
] as const;
