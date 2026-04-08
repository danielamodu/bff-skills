---
name: mev-sentry-agent
skill: mev-sentry
description: "Stacks mempool DEX call scanner — detects fee-competition patterns, nonce contention, and sandwich risk on Alex and Bitflow. Read-only; no wallet required."
---
# Agent Behavior — MEV Sentry

## Decision order

1. **Scout Phase**: Call `scout` to get an overview of pending DEX calls and the current mempool median fee rate.
2. **Identification Phase**: Review `high_value_calls` — any `contract_call` targeting Alex or Bitflow with `estimated_impact` of `medium` or `high`.
3. **Analysis Phase**: For flagged transactions, run `analyze --txid <tx_id>` to check nonce competition, fee-bumping patterns, and sandwich risk.
4. **Risk Assessment**: Flag transactions where `nonce_competition.fee_bumping_detected` is true or `sandwich_risk.flagged` is true as potential MEV activity.
5. **Reporting**: Surface findings to the user or downstream agents (e.g., `yield-optimizer`, `safe-swapper`). Label all detections as "Potential" until confirmed by block inclusion.

## Guardrails

- **Read-Only Enforcement**: This agent never signs or broadcasts transactions. It is purely an intelligence layer.
- **Mainnet Only**: Do not run on testnet — mempool volume is too low for meaningful analysis.
- **False Positive Handling**: All detections are heuristic-based. Label findings as "Potential MEV" until on-chain confirmation.
- **Privacy**: Never log full transaction arguments, even though mempool data is public.

## Output contract

All commands return structured JSON to stdout. All errors return `{ "error": "descriptive message" }`.

### `scout` output
```json
{
  "mempool_size": 1257,
  "median_fee_rate": 800,
  "dex_calls_found": 3,
  "high_value_calls": [
    {
      "tx_id": "0x...",
      "sender": "SP...",
      "contract": "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.bitflow-core",
      "function": "swap-x-for-y",
      "fee_rate": 2800,
      "estimated_impact": "high"
    }
  ],
  "timestamp": "2026-04-08T07:00:00.000Z"
}
```

### `analyze` output
```json
{
  "tx_id": "0x...",
  "sender": "SP...",
  "fee_rate": 2800,
  "median_mempool_fee_rate": 800,
  "fee_vs_median": "350.0%",
  "impact": "high",
  "is_dex_call": true,
  "nonce_competition": {
    "competing_tx_count": 2,
    "fee_bumping_detected": true
  },
  "sandwich_risk": {
    "bracketing_dex_calls": 2,
    "flagged": true
  },
  "type": "contract_call",
  "timestamp": "2026-04-08T07:00:01.000Z"
}
```

### `scan` output
```json
{
  "status": "complete",
  "mempool_size": 1257,
  "median_fee_rate": 800,
  "alerts_count": 1,
  "alerts": [
    {
      "tx_id": "0x...",
      "sender": "SP...",
      "contract": "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.fixed-weight-pool-v1-01",
      "function": "swap-x-for-y",
      "fee_rate": 2800,
      "impact": "high"
    }
  ],
  "timestamp": "2026-04-08T07:00:02.000Z"
}
```

### `doctor` output
```json
{
  "status": "healthy",
  "latency": "142ms",
  "network": 1,
  "chain_tip": 167432,
  "timestamp": "2026-04-08T07:00:03.000Z"
}
```

## On error

All errors exit with code 1 and return:
```json
{ "error": "descriptive message" }
```
