---
metadata:
  name: hodlmm-auto-rebalancer
  description: "Autonomously rebalances HODLMM LP positions by moving liquidity to active bins."
  author: "YOUR_GITHUB_USERNAME"
  version: "1.0.0"
  tags: "Trading, Yield, HODLMM"
  requires: "STACKS_PRIVATE_KEY, ROUTER_ADDRESS"
---

## What it does
This skill monitors LP positions on HODLMM (Discretized Liquidity AMM) to detect bin drift. When the active market bin moves significantly away from the user's liquidity bin, the agent automatically executes a `move-liquidity` transaction to re-center the position and maximize yield efficiency.

## Why agents need it
Autonomous agents need this to maintain "In-the-money" liquidity without manual intervention. Since HODLMM yield is only generated when price is within the active bin, a passive position can quickly stop earning fees; this skill ensures the agent remains productive 24/7.

## Safety notes
This skill requires a private key to sign mainnet transactions. It only interacts with the Bitflow DLMM router to reallocate existing liquidity. It cannot withdraw funds to external addresses. Users should only keep enough STX in the wallet to cover transaction fees.

## Commands

### check
Check if the current LP position has drifted from the active bin.
- `p, --pool`: The HODLMM pool ID to check.

### rebalance
Execute a transaction to move liquidity to the current active bin.
- `p, --pool`: The HODLMM pool ID to rebalance.

## Output contract
All commands return a JSON object:
- Success: `{ "status": "success", "action": "string", "data": { ... }, "error": null }`
- Failure: `{ "error": "descriptive message" }`
