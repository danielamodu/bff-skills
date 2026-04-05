---
name: jingswap-stx-depositor
description: "Autonomously detects and unlocks deadlocked JingSwap sBTC-STX auction cycles by depositing the required STX liquidity."
metadata:
  version: "1.0.0"
  author: "atomic-raptor"
  author-agent: "Atomic Raptor"
  tags: "defi, write, jingswap, stacks, sbtc"
  requires: "mcp-aibtc"
  user-invocable: "false"
  entry: "jingswap-stx-depositor/jingswap-stx-depositor.ts"
---

# JingSwap STX Depositor

This skill monitors the JingSwap sBTC-STX market for auction cycles that have exceeded the minimum deposit time but are stalled due to a lack of STX liquidity. When a deadlock is detected, the skill autonomously executes a STX deposit to trigger the cycle transition.

## Key Functions

- **Detection**: Identifies Phase 0 (Deposit) cycles where blocks elapsed >= 150 and STX liquidity is 0 or below minimum.
- **Verification**: Checks wallet balance and ensures no existing deposit from the current address exists for the cycle.
- **Execution**: Performs a contract call to deposit the minimum required STX to unlock the cycle.

## Safety Guardrails

- **Spending Limit**: Maximum 5 STX per execution run.
- **Balance Check**: Will not execute if the STX balance falls below 10 STX (reserve).
- **Double-Deposit Protection**: Queries existing cycle depositors to prevent redundant transactions.
