---
name: hodlmm-bin-exit
description: "Monitors HODLMM pool volatility and automatically withdraws liquidity from active bins when downside volatility exceeds a configurable crisis threshold, protecting LP capital from impermanent loss during extreme price moves."
metadata:
  author: "0xkenpacchi"
  author-agent: "Atomic Raptor"
  user-invocable: "false"
  arguments: "doctor | status | run"
  entry: "hodlmm-bin-exit/hodlmm-bin-exit.ts"
  requires: "wallet, signing, settings"
  tags: "defi, write, mainnet-only, requires-funds, l2"
---

# HODLMM Bin Exit

## What it does
Monitors a HODLMM (DLMM) pool's volatility regime and executes an emergency liquidity withdrawal when the volatility score crosses a configurable crisis threshold. It reads pool bin state, computes a volatility score, and — if crisis conditions are met — calls the HODLMM `remove-liquidity` contract function to pull the wallet's position from active bins before further IL accumulates.

## Why agents need it
HODLMM LPs face asymmetric downside during rapid price moves: bins drift out of range, IL accumulates, and by the time a human intervenes the damage is done. This skill gives agents a programmable circuit breaker — a single `run` call that checks regime and exits if the threshold is breached, enabling fully autonomous capital protection.

## Safety notes
- **Writes to chain.** The `run` command submits a Stacks transaction to remove liquidity. This is irreversible once confirmed.
- **Mainnet only.** HODLMM contracts and Bitflow APIs are mainnet-only.
- **Requires funds.** Wallet must hold STX for transaction fees.
- **Threshold-gated.** Will not withdraw unless volatility score meets or exceeds `--threshold` (default: 61 = crisis). Below threshold, the skill exits cleanly with `"action": "hold"`.
- **Position must exist.** If the wallet has no position in the specified pool, the skill errors safely without submitting any transaction.

## Commands

### doctor
Checks environment readiness: wallet address resolution, Bitflow API reachability, and pool existence.

```
bun run hodlmm-bin-exit/hodlmm-bin-exit.ts doctor --pool-id <pool_id>
```

Options:
- `--pool-id` (required) — HODLMM pool identifier (e.g. `dlmm_3`)

### status
Read-only check. Returns current volatility score, regime, and whether exit conditions are met — without submitting any transaction.

```
bun run hodlmm-bin-exit/hodlmm-bin-exit.ts status --pool-id <pool_id> --address <stx_address>
```

Options:
- `--pool-id` (required) — HODLMM pool identifier
- `--address` (required) — Stacks address to check position for
- `--threshold <number>` (optional) — Volatility score threshold to flag exit (default: 61)

Output:
```json
{
  "network": "mainnet",
  "poolId": "dlmm_3",
  "address": "SP2...",
  "volatilityScore": 74,
  "regime": "crisis",
  "positionBinCount": 3,
  "driftScore": 45,
  "exitConditionMet": true,
  "threshold": 61,
  "action": "exit",
  "timestamp": "2026-04-11T00:00:00.000Z"
}
```

### run
Core execution. Checks volatility regime and — if `exitConditionMet` is true — submits a `remove-liquidity` transaction for all active position bins. If threshold is not met, exits cleanly with no transaction.

```
bun run hodlmm-bin-exit/hodlmm-bin-exit.ts run --pool-id <pool_id> --address <stx_address>
```

Options:
- `--pool-id` (required) — HODLMM pool identifier
- `--address` (required) — Stacks address holding the position
- `--threshold <number>` (optional) — Volatility score threshold to trigger exit (default: 61)
- `--max-fee <number>` (optional) — Maximum STX fee in microstacks (default: 10000)

Output on exit:
```json
{
  "status": "success",
  "action": "exited",
  "txid": "0x...",
  "poolId": "dlmm_3",
  "binsExited": [445, 446, 447],
  "volatilityScore": 74,
  "regime": "crisis",
  "timestamp": "2026-04-11T00:00:00.000Z"
}
```

Output on hold (threshold not met):
```json
{
  "status": "success",
  "action": "hold",
  "poolId": "dlmm_3",
  "volatilityScore": 22,
  "regime": "calm",
  "threshold": 61,
  "message": "Volatility below exit threshold. Position held.",
  "timestamp": "2026-04-11T00:00:00.000Z"
}
```

## Output contract

All outputs are JSON to stdout.

Success:
```json
{ "status": "success", "action": "exited | hold", "data": {} }
```

Error:
```json
{ "error": "descriptive message" }
```

## Known constraints
- Mainnet only — Bitflow HODLMM APIs and contracts do not exist on testnet.
- Volatility score 0–100: 0–30 = calm, 31–60 = elevated, 61–100 = crisis. Default exit threshold is 61.
- Only removes liquidity from bins where the wallet holds a position. Does not affect other LPs.
- Transaction fee capped at `--max-fee` microstacks (default 10,000 = 0.01 STX). Skill errors if estimated fee exceeds cap.
- If the wallet has no position in the pool, `run` returns `{ "error": "Address has no position in this pool" }` without submitting a transaction.
- One pool per invocation. To protect multiple pools, invoke once per pool.
