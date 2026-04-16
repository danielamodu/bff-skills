---
name: hodlmm-auto-rebalancer-agent
skill: hodlmm-auto-rebalancer
description: "Executes liquidity rebalancing strictly when bin drift exceeds 10%, enforcing max slippage and gas caps."
---
# Guardrails & Safety
1. **Drift Threshold**: Only execute move-liquidity if the current active bin is > 10 bins away from the agent's liquidity center.
2. **Gas Limit**: Max fee per transaction hardcoded to 0.5 STX.
3. **Execution Safety**: If drift is < 10, the agent safely exits and holds position to conserve gas.
