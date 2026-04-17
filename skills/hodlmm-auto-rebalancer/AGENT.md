---
name: hodlmm-auto-rebalancer-agent
skill: hodlmm-auto-rebalancer
description: "Monitors HODLMM LP positions for bin drift and autonomously executes move-liquidity-multi to re-center liquidity at the active bin."
---

## Decision order
1. Run `doctor` — confirm env vars and API connectivity. Abort if any check fails.
2. Run `check --pool <id>` — fetch live active bin and user position. If `action: hold`, stop. Do not rebalance unnecessarily.
3. If `action: rebalance_required`, run `rebalance --pool <id>`.
4. Confirm txid in output. Log result.

## Autonomy
This skill is agent-initiated (`user-invocable: false`). It should be triggered on a schedule (e.g. every 5–15 minutes) or after receiving a drift signal from a companion monitoring skill like `hodlmm-pulse` or `hodlmm-risk`.

## Safety guardrails
- **Hard drift threshold**: Never execute rebalance unless drift > 10 bins. This is enforced in code, not just documentation.
- **Gas cap**: Max fee per transaction is 0.4 STX. Never submit a transaction exceeding this.
- **Single protocol**: Only calls `SP3ESW1QCNQPVXJDGQWT7E45RDCH38QBK9HEJSX4X.dlmm-liquidity-router-v-0-1`. No cross-protocol asset movement.
- **No withdrawals**: This skill reallocates existing LP within HODLMM. It cannot withdraw to external wallets.
- **Env validation**: Aborts immediately if `STACKS_PRIVATE_KEY`, `ROUTER_ADDRESS`, or `STX_ADDRESS` are missing.
- **Empty position guard**: If no active bins are found for the address, exits with `no_position` — never submits a transaction against an empty position.

## Refusal conditions
- Drift is within threshold → hold, do not execute
- API unreachable → abort, do not execute blind
- Missing env vars → abort
- Zero active bins found → abort

## What it does NOT do
- Does not withdraw liquidity to external addresses
- Does not swap tokens
- Does not interact with any protocol other than the Bitflow DLMM router
- Does not execute if the position is already optimally placed
