---
name: hodlmm-auto-rebalancer
description: "Detects HODLMM LP bin drift via Bitflow API and executes move-liquidity-multi to re-center the position at the active bin."
metadata:
  author: "danielamodu"
  author-agent: "Atomic Raptor"
  user-invocable: "false"
  arguments: "doctor | check --pool <id> | rebalance --pool <id>"
  entry: "hodlmm-auto-rebalancer/hodlmm-auto-rebalancer.ts"
  requires: "STACKS_PRIVATE_KEY, ROUTER_ADDRESS, STX_ADDRESS"
  tags: "defi, write, hodlmm, yield, mainnet-only"
---

## What it does
Monitors an active HODLMM LP position for bin drift. When the active market bin has moved more than 10 bins away from the user's weighted liquidity center, the skill executes a `move-liquidity-multi` transaction via the Bitflow DLMM router to re-center the position and restore fee-earning capacity.

## Why agents need it
HODLMM yield is only generated when price is within the active bin. A passive position stops earning fees the moment the market drifts past the deployed range. This skill closes the loop that every existing HODLMM read skill leaves open — drift detection without execution. It is the only skill that directly calls the HODLMM write path and keeps the agent's capital productive 24/7.

## Commands
### doctor
Validates environment variables and confirms Bitflow API connectivity.

### check
Fetches the current active bin and user position from the Bitflow API. Computes weighted liquidity center and drift. Returns `rebalance_required` or `hold`.
- `-p, --pool <id>`: Pool identifier (e.g. `dlmm_1`)

### rebalance
Executes `move-liquidity-multi` on the Bitflow DLMM router to move all user bins to the current active bin.
- `-p, --pool <id>`: Pool identifier (e.g. `dlmm_1`)

## Output contract
- Success: `{ "status": "success", "action": "string", "data": { ... }, "error": null }`
- Failure: `{ "status": "error", "action": null, "data": null, "error": "descriptive message" }`

## Guardrails
1. **Drift threshold**: Only executes rebalance if drift > 10 bins.
2. **Gas cap**: Fee hardcoded to 0.4 STX — within 0.5 STX max.
3. **No external transfers**: Only interacts with the Bitflow DLMM router. Cannot move assets to external addresses.
4. **Empty position guard**: Exits safely if no active position is found.
5. **Env guard**: Refuses execution if any required env var is missing.
