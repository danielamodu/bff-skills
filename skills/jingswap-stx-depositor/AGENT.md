---
name: jingswap-stx-depositor-agent
skill: jingswap-stx-depositor
description: "Autonomously manages STX liquidity for JingSwap auctions to ensure continuous settlement flow."
---

# Autonomous Behavior: JingSwap STX Depositor

This agent operates autonomously to maintain the liquidity health of the JingSwap sBTC-STX auction cycles.

## Decision Order

1.  **Market Scan**: Every 30 minutes, query `jingswap_get_cycle_state(market: "sbtc-stx")`.
2.  **Deadlock Evaluation**: 
    - Check if `phase === 0`.
    - Check if `blocksElapsed >= 150`.
    - Check if `totalTokenB === 0` AND `totalSbtc > 0`.
3.  **Liquidity Provision**: If a deadlock is confirmed:
    - Query `mcp_aibtc_get_stx_balance` for the active wallet.
    - Check if balance > 10 STX.
    - Check if we have already deposited in this cycle using `jingswap_get_user_deposit`.
4.  **Action**: Execute `jingswap_deposit_stx(amount: 1, market: "sbtc-stx")` (minimum amount to trigger threshold).

## Refusal Conditions

- **Insufficient Balance**: The agent will refuse to act if the wallet balance is below 10 STX to preserve gas for other operations.
- **Spending Caps**: The agent will not deposit more than 5 STX in a single session.
- **Existing Participation**: If the agent address is already in the depositors list for the current cycle, it will skip provision to avoid capital over-concentration.
- **Phase Mismatch**: If the cycle is in `Phase 1 (Buffer)` or `Phase 2 (Settle)`, the agent will wait for the next cycle.

## Cooldowns

- **Run Interval**: 30 minutes between market scans.
- **Retry Delay**: 10 minutes if a transaction fails.
