---
name: mev-sentry
description: "Stacks mempool MEV monitor — scans pending transactions for front-running, sandwich attacks, and high-value swap opportunities. Detects fee-competition patterns and targets known DEX contracts."
metadata:
  author: "AtomicRaptor"
  author-agent: "Atomic Raptor"
  user-invocable: "false"
  arguments: "scout | analyze | watch"
  entry: "mev-sentry/mev-sentry.ts"
  requires: "settings"
  tags: "l2, defi, read-only, mainnet-only, mev"
---

# MEV Sentry Skill

## What it does
MEV Sentry monitors the Stacks blockchain mempool in real-time to identify Miner Extractable Value (MEV) opportunities and threats. It specifically targets `contract_call` transactions involving decentralized exchanges (DEXs) like Bitflow and Alex.

## Why agents need it
Autonomous DeFi agents are vulnerable to front-running and sandwich attacks. This skill provides:
1. **Threat Detection**: Identification of pending transactions that might manipulate price before your agent's transaction is confirmed.
2. **Opportunity Identification**: Detection of high-slippage swaps that create arbitrage or liquidation opportunities.
3. **Fee Intelligence**: Analysis of fee-competition patterns to help agents set optimal transaction fees.

## Safety notes
- **Read-only**: This skill only queries the Hiro API and does not broadcast transactions.
- **Mainnet Recommended**: Mempool volume on testnet is typically too low for meaningful MEV analysis.
- **Rate Limits**: Respects Hiro API unauthenticated limits (50 RPM) but performs better with a `HIRO_API_KEY`.

## Commands

### scout
Fetch a summary of current mempool activity, filtering for high-fee or DEX-related transactions.
```bash
bun run mev-sentry/mev-sentry.ts scout [--limit 50]
```

### analyze
Perform deep analysis on a specific transaction or the top of the mempool to detect sandwich or front-running patterns.
```bash
bun run mev-sentry/mev-sentry.ts analyze [--txid <tx_id>]
```

### watch
Poll the mempool at a high frequency to detect and alert on specific MEV signatures.
```bash
bun run mev-sentry/mev-sentry.ts watch [--interval 10] [--min-fee 10000]
```

## Output contract
All outputs are flat JSON to stdout.

### scout output:
```json
{
  "mempool_size": 142,
  "high_value_calls": [
    {
      "tx_id": "0x...",
      "sender": "SP...",
      "contract": "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.fixed-weight-pool-v1-01",
      "function": "swap-x-for-y",
      "fee_rate": 5000,
      "estimated_impact": "high"
    }
  ],
  "timestamp": "2026-03-30T22:45:00.000Z"
}
```

## Known constraints
- Polling frequency is limited by API rate limits.
- Does not currently support WebSocket streaming (polling only).
- MEV detection is heuristic-based and may produce false positives.
