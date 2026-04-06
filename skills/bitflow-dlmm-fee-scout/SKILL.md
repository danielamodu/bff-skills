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
---

# bitflow-dlmm-fee-scout

Scans all active Bitflow DLMM pools and ranks them by fee efficiency, flagging pools where 24h APR diverges from 30-day baseline — signaling temporary yield spikes for agent liquidity repositioning.

## Overview
This skill provides a mechanism for agents to identify high-yield fee efficiency opportunities on the Bitflow DLMM (Discretized Liquidity Market Maker) platform. By comparing 24-hour performance against a 30-day baseline, it isolates short-term yield spikes that represent optimal repositioning targets.

## Key Functions
- **Fee Efficiency Scoring**: Ranks pools by 24h fee yield (fees collected relative to TVL).
- **APR Divergence Monitoring**: Compares current 24h APR against the 30-day rolling average.
- **Signal Generation**: Categorizes pools as SPIKE, STABLE, or COOLING based on APR delta.
- **Agent Behavior Recommendations**: Provides specific REPOSITION, HOLD, or EXIT actions for automated liquidity management.

## Technical Details
The skill interfaces with the Bitflow BFF and Quotes APIs to gather real-time pool metrics and bin-level data.

### Commands
- `status`: Provides a raw JSON snapshot of all active DLMM pools.
- `run`: Analyzes pool performance, calculates divergence, and outputs ranked recommendations.
- `doctor`: Verifies connectivity to Bitflow API endpoints.

## Safety Guardrails
- **TVL Threshold**: Minimum TVL filter (default: $100) to avoid low-liquidity slippage risks.
- **Zero-Fee Filter**: Ignores pools with zero 24h volume/fees.
- **Read-Only**: This skill only scouts and reports; it does not execute transactions.
