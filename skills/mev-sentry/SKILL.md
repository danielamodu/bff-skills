---
name: mev-sentry
description: "Stacks mempool DEX call scanner — filters pending transactions targeting Alex and Bitflow, scores fee impact against mempool median, and checks for nonce competition and sandwich patterns."
metadata:
  author: "AtomicRaptor"
  author-agent: "Atomic Raptor"
  user-invocable: "false"
  arguments: "scout | analyze | scan | doctor"
  entry: "mev-sentry/mev-sentry.ts"
  requires: "settings"
  tags: "defi, read-only, mainnet-only, infrastructure"
---

# MEV Sentry Skill

## What it does

MEV Sentry scans the Stacks blockchain mempool for pending `contract_call` transactions targeting known DEX contracts (Alex and Bitflow). It scores each call's fee rate against the current mempool median and runs heuristic checks for nonce competition, fee-bumping, and sandwich patterns.

## Why agents need it

Autonomous DeFi agents are vulnerable to front-running and sandwich attacks. This skill provides:

1. **DEX Call Filtering**: Isolates pending mempool transactions targeting Alex or Bitflow from general mempool noise.
2. **Fee Intelligence**: Scores each transaction's fee rate as `low`, `medium`, or `high` relative to the live mempool median — not a hardcoded threshold.
3. **Nonce Competition Detection**: Identifies when multiple pending transactions share the same sender, indicating potential fee-bumping activity.
4. **Sandwich Pattern Detection**: Flags DEX calls that are bracketed by other pending DEX calls from different senders.
5. **Connectivity Diagnostics**: Verifies Hiro API status and measures latency before relying on mempool data.

## Safety notes

- **Read-only**: This skill only queries the Hiro API. It does not sign or broadcast transactions.
- **Mainnet only**: Testnet mempool volume is too low for meaningful analysis.
- **Heuristic-based**: All detections are probabilistic. Label findings as "Potential" until confirmed by block inclusion.
- **Rate limits**: Respects Hiro API unauthenticated limits. Optionally set `HIRO_API_KEY` as an environment variable to increase rate limits.

## Commands

### scout
Filter the mempool for pending DEX calls and score their fee impact.
```bash
bun run mev-sentry/mev-sentry.ts scout [--limit 50]
```

### analyze
Run MEV heuristics on a specific transaction: fee vs median, nonce competition, fee-bumping, sandwich risk.
```bash
bun run mev-sentry/mev-sentry.ts analyze --txid <tx_id>
```

### scan
Single mempool pass that surfaces DEX calls with elevated fee rates as alerts.
```bash
bun run mev-sentry/mev-sentry.ts scan
```

### doctor
Check Hiro API connectivity and return current network status.
```bash
bun run mev-sentry/mev-sentry.ts doctor
```

## Impact scoring

`estimated_impact` is derived from the transaction's fee rate relative to the current mempool median:

| Tier   | Condition                        |
|--------|----------------------------------|
| `high`   | fee_rate > median × 3          |
| `medium` | fee_rate > median × 1.5        |
| `low`    | fee_rate ≤ median × 1.5        |

## Known constraints

- Does not support WebSocket streaming (polling only via repeated `scan` calls).
- Sandwich detection is structural (bracketing DEX calls) — it does not decode swap amounts or slippage parameters.
- Nonce competition relies on sender address matching, not full nonce sequence analysis.
- All detections are heuristic and may produce false positives.
