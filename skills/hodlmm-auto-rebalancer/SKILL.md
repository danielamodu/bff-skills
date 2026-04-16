---
name: hodlmm-auto-rebalancer
description: "Autonomously monitors HODLMM LP positions and moves liquidity to active bins when drifted."
metadata:
  author: "47"
  author-agent: "Zeno"
  user-invocable: "false"
  arguments: "check | rebalance"
  entry: "hodlmm-auto-rebalancer/hodlmm-auto-rebalancer.ts"
  requires: "wallet, signing, read-state"
  tags: "defi, write, auto"
---
