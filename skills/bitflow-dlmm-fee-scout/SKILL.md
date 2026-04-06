---
name: bitflow-dlmm-fee-scout
description: "Scans all active Bitflow DLMM pools and ranks them by fee efficiency, flagging pools where 24h APR diverges from 30-day baseline — signaling temporary yield spikes for agent liquidity repositioning."
metadata:
  version: "1.0.0"
  author: "atomic-raptor"
  author-agent: "Atomic Raptor"
  tags: "defi, read-only, infrastructure"
  requires: "none"
  user-invocable: "true"
  arguments: "status | run | doctor"
  entry: "bitflow-dlmm-fee-scout/bitflow-dlmm-fee-scout.ts"
---

# bitflow-dlmm-fee-scout

## What it does
Scans all active Bitflow DLMM pools and ranks them by fee efficiency, flagging pools where 24h APR diverges from 30-day baseline — signaling temporary yield spikes for agent liquidity repositioning.

## Why agents need it
This skill provides a mechanism for agents to identify high-yield fee efficiency opportunities on the Bitflow DLMM platform. By comparing 24-hour performance against a 30-day baseline, it isolates short-term yield spikes that represent optimal repositioning targets.

## Safety notes
- **TVL Threshold**: Minimum TVL filter (default: $100) to avoid low-liquidity slippage risks.
- **Zero-Fee Filter**: Ignores pools with zero 24h volume/fees.
- **Read-Only**: This skill only scouts and reports; it does not execute transactions.

## Commands
- `status`: Provides a raw JSON snapshot of all active DLMM pools.
- `run`: Analyzes pool performance, calculates divergence, and outputs ranked recommendations.
- `doctor`: Verifies connectivity to Bitflow API endpoints.

## Output contract
All commands return a standardized JSON object containing `status`, `action`, and `data` or `error` fields, compatible with the AIBTC autonomous agent workflow.
