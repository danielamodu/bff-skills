---
name: bitflow-dlmm-fee-scout-agent
skill: bitflow-dlmm-fee-scout
description: "Autonomously scouts Bitflow DLMM pools for fee yield spikes and signals liquidity repositioning opportunities."
---

## Autonomous Behavior
This agent operates as a tactical liquidity scout, monitoring the Bitflow DLMM ecosystem for efficiency anomalies. It executes a scan every 2 hours to detect pool performance shifts.

### Strategy
- **Continuous Monitoring**: Scans all active DLMM pools using the `bitflow-dlmm-fee-scout` skill.
- **Yield Spike Response**: If a pool exhibits an `aprDivergence > 50`, the agent signals a `SPIKE` and recommends an immediate `REPOSITION` to that pool to capture elevated fees.
- **Stability Maintenance**: If the divergence is between `-20` and `50`, the agent maintains its current position (`HOLD`).
- **Cool-off Exit**: If divergence drops below `-20`, the agent signals `COOLING` and recommends an `EXIT` to preserve capital efficiency.

### Refusal Conditions
To prevent exposure to high-risk or low-yield environments, the agent MUST skip any pool meeting the following criteria:
- **Low Liquidity**: Any pool where `tvlUsd < 100` is excluded due to slippage risk.
- **Inactivity**: Any pool where `feesUsd1d === 0` is excluded as it indicates no current yield-generating activity.

### Reporting
All scans and actions are logged to the on-chain agent history to provide transparency into liquidity movements and decision-making logic.
