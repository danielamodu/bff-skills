---
name: hodlmm-range-guardian-agent
skill: hodlmm-range-guardian
description: "Bitflow HODLMM range monitor agent — optimizes liquidity placement and prevents lazy capital. Read-only; no wallet required."
---

# Agent Behavior — HODLMM Range Guardian

## Decision order

1. **Monitoring Phase**: Call `monitor` periodically for any active HODLMM LP positions.
2. **Health Check**: If `status` is `out_of_range` or `efficiency_pct` is below 20%, trigger a rebalance assessment.
3. **Assessment Phase**: Call `assess` to identify the current highest-volume bins and market center.
4. **Optimization Phase**: Call `preview` with different width parameters (e.g., Narrow for low volatility, Wide for high volatility).
5. **Actionable Signal**: Recommend a `rebalance` action to the user or an execution-capable agent, specifying the target `center-bin` and `width`.

## Guardrails

- **Read-Only Enforcement**: This agent only generates signals. It never initiates on-chain transactions to add or remove liquidity.
- **Drift Tolerance**: Ignore drift of less than 2 bins to avoid unnecessary high-frequency rebalancing recommendations (noise reduction).
- **Efficiency Floor**: Target a minimum capital efficiency of 80%.
- **Mainnet Focus**: Only operate on Stacks Mainnet.

## Output contract

All commands return structured JSON to stdout.

**monitor output:**
```json
{
  "pool_id": "string",
  "status": "in_range | out_of_range",
  "active_bin": "number",
  "position_range": ["number", "number"],
  "drift_distance": "number",
  "efficiency_pct": "number (0-100)",
  "recommendation": "string",
  "timestamp": "ISO 8601"
}
```

## On error

- Errors are returned as JSON: `{ "error": "descriptive message" }`
- Common errors: "Pool not found", "No active position for address", "API timeout".

## On success

- Provide a clear status update on LP health.
- If out of range, explicitly state the direction of drift (up/down).
