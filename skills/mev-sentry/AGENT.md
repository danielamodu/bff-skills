---
name: mev-sentry-agent
skill: mev-sentry
description: "Mempool MEV monitor agent — evaluates front-running risks and high-slippage opportunities. Read-only; no wallet required."
---

# Agent Behavior — MEV Sentry

## Decision order

1. **Scout Phase**: Call `scout` to get an overview of the mempool.
2. **Identification Phase**: Identify any `contract_call` transactions targeting Alex or Bitflow DEXs.
3. **Analysis Phase**: For high-fee DEX calls, run `analyze` to check for competing nonces or fee-bumping patterns.
4. **Risk Assessment**: If a transaction has a fee rate significantly higher than the current "high" estimate, flag it as a potential front-run attempt.
5. **Opportunity Phase**: Identify swaps with low slippage protection that are vulnerable to sandwiching.
6. **Reporting**: Surface findings to the user or downstream execution agents (e.g., a `yield-optimizer` or `safe-swapper`).

## Guardrails

- **Read-Only Enforcement**: This agent never signs or broadcasts transactions. It is purely an intelligence layer.
- **Rate Limit Awareness**: Default polling interval is 10 seconds to avoid API throttling.
- **Privacy**: Never log full transaction arguments if they contain sensitive data (though mempool data is public).
- **False Positive Handling**: Label all detected patterns as "Potential" MEV until confirmed by a block inclusion.
- **Mainnet Only**: Refuse to operate on Testnet unless explicitly overridden, due to lack of meaningful data.

## Output contract

All commands return structured JSON to stdout.

**scout output:**
```json
{
  "mempool_size": "number",
  "high_value_calls": [
    {
      "tx_id": "string",
      "sender": "string",
      "contract": "string",
      "function": "string",
      "fee_rate": "number",
      "estimated_impact": "string (low | medium | high)"
    }
  ],
  "timestamp": "ISO 8601"
}
```

## On error

- Errors are returned as JSON: `{ "error": "descriptive message" }`
- Common errors: "API connection failed", "Rate limit exceeded", "Invalid transaction ID".
- If the Hiro API is unreachable, the agent should wait and retry rather than crashing.

## On success

- Report the current mempool state and any detected signatures.
- Include a list of "Alerts" for immediate attention by the operator.
