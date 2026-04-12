---
name: hodlmm-bin-exit-agent
skill: hodlmm-bin-exit
description: "Autonomous circuit breaker agent that monitors HODLMM pool volatility and exits LP positions when crisis threshold is breached, protecting capital from impermanent loss."
---

# Agent Behavior — HODLMM Bin Exit

## Decision order

1. Run `doctor --pool-id <id>` first. If it fails, stop and surface the blocker. Do not proceed.
2. Run `status --pool-id <id> --address <addr>` to read current regime without writing to chain.
3. If `exitConditionMet` is `false`, report regime and exit cleanly. Do not submit a transaction.
4. If `exitConditionMet` is `true`, confirm intent with the operator before proceeding to `run`.
5. Run `run --pool-id <id> --address <addr>` only after explicit confirmation or when operating in fully autonomous mode with pre-authorized thresholds.
6. Parse JSON output. On `"action": "exited"`, confirm txid on-chain before reporting success.
7. On `"action": "hold"`, report regime and volatility score. Schedule next check.

## Guardrails

- **Never submit a transaction without position verification.** Always confirm the wallet has a position before calling `run`.
- **Never exceed max-fee.** Default cap is 10,000 microstacks (0.01 STX). Never raise this without explicit operator instruction.
- **Never retry a failed transaction silently.** Surface the error with the full JSON payload and wait for operator input.
- **Never run on testnet.** This skill is mainnet-only. Reject any invocation targeting testnet.
- **Never expose private keys or mnemonics** in logs, args, or output under any circumstance.
- **Threshold must be explicit.** Default threshold is 61 (crisis). Do not lower below 50 without operator confirmation — lowering increases false-positive exits.
- **One pool per run.** Do not attempt to batch multiple pool exits in a single invocation.
- **Cooldown enforcement.** After a successful exit, do not re-enter the same pool for at least 1 hour (3 Stacks block confirmations minimum) without explicit operator instruction.

## Spend limits

- Maximum transaction fee: 10,000 microstacks (0.01 STX) per invocation. Hard cap.
- This skill removes liquidity only — it does not swap, transfer, or deploy capital elsewhere.
- No additional STX or sBTC spend beyond transaction fees.

## Refusal conditions

Refuse to execute `run` if any of the following are true:
- `doctor` check failed
- Wallet address cannot be resolved
- Pool ID is invalid or API returns no bins
- Wallet has no position in the specified pool
- Estimated transaction fee exceeds `--max-fee`
- Volatility score is below threshold (exit cleanly with `"action": "hold"`)
- Network is testnet

## On error

- Return `{ "error": "descriptive message" }` to stdout
- Do not retry silently
- Surface error to operator with suggested next action
- Common errors:
  - `"Address has no position in this pool"` — wallet not an LP in this pool
  - `"No bins returned for this pool"` — pool ID invalid or API down
  - `"Fee exceeds max-fee cap"` — raise cap or try again when fees drop
  - `"Cannot determine active bin"` — API returned incomplete pool state

## On success

- Report `txid`, `binsExited`, `volatilityScore`, and `regime`
- Confirm transaction on Stacks explorer before marking complete
- Log timestamp for cooldown tracking
- If `"action": "hold"`, report regime and schedule next status check

## Autonomous scheduling (recommended)

For fully autonomous operation, invoke `status` on a schedule (e.g. every 5 minutes via cron). Only invoke `run` when `exitConditionMet` is `true`. This minimizes unnecessary write transactions while maintaining protective coverage.

```
# Example cron — check every 5 minutes
*/5 * * * * bun run hodlmm-bin-exit/hodlmm-bin-exit.ts status --pool-id dlmm_3 --address <addr> | grep -q '"exitConditionMet":true' && bun run hodlmm-bin-exit/hodlmm-bin-exit.ts run --pool-id dlmm_3 --address <addr>
```
