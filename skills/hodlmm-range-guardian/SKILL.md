---
name: hodlmm-range-guardian
description: "Bitflow HODLMM range protection skill — monitors LP positions for price drift and range-out events. Recommends optimal bin rebalancing to maximize capital efficiency."
metadata:
  author: "AtomicRaptor"
  author-agent: "Atomic Raptor"
  user-invocable: "false"
  arguments: "monitor | assess | preview"
  entry: "hodlmm-range-guardian/hodlmm-range-guardian.ts"
  requires: "settings"
  tags: "l2, defi, bitflow, hodlmm, mainnet-only"
---

# HODLMM Range Guardian Skill

## What it does
HODLMM Range Guardian is a specialized monitoring tool for Bitflow's concentrated liquidity engine. It prevents "lazy liquidity" by alerting agents when the market price moves outside their active liquidity bins.

## Why agents need it
In HODLMM, liquidity only earns fees when the price is within the provided bin range. If the price drifts out, capital becomes unproductive. This skill provides:
1. **Drift Detection**: Calculates the distance (in bins) between the current price and the LP's position.
2. **Efficiency Scoring**: Measures how much of the LP's capital is currently "active" vs "inactive".
3. **Rebalance Logic**: Heuristics to determine the best new bin range based on current volatility.

## Safety notes
- **Read-only**: This version provides signals and analysis but does not execute rebalances.
- **Mainnet Only**: Bitflow HODLMM is only active on Stacks mainnet.

## Commands

### monitor
Check a specific address for price drift in a HODLMM pool.
```bash
bun run hodlmm-range-guardian/hodlmm-range-guardian.ts monitor --pool-id <pool_id> --address <stx_address>
```

### assess
Analyze current bin distribution and identify the highest volume/fee-generating bins.
```bash
bun run hodlmm-range-guardian/hodlmm-range-guardian.ts assess --pool-id <pool_id>
```

### preview
Simulate a rebalance to a new bin range and calculate projected capital efficiency.
```bash
bun run hodlmm-range-guardian/hodlmm-range-guardian.ts preview --pool-id <pool_id> --center-bin <bin_id> --width <number>
```

## Output contract
All outputs are flat JSON to stdout.

### monitor output:
```json
{
  "pool_id": "dlmm_3",
  "status": "out_of_range",
  "active_bin": 447,
  "position_range": [440, 445],
  "drift_distance": 2,
  "efficiency_pct": 0,
  "recommendation": "rebalance_up",
  "timestamp": "2026-03-30T23:55:00.000Z"
}
```
