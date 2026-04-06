#!/usr/bin/env bun

const API_BASE = "https://bff.bitflowapis.finance";

async function fetchPools() {
  const response = await fetch(`${API_BASE}/api/app/v1/pools`);
  if (!response.ok) throw new Error(`Failed to fetch app pools: ${response.statusText}`);
  const json = await response.json();
  return json.data || [];
}

async function fetchQuotesPools() {
  const response = await fetch(`${API_BASE}/api/quotes/v1/pools`);
  if (!response.ok) throw new Error(`Failed to fetch quotes pools: ${response.statusText}`);
  const json = await response.json();
  return json.pools || [];
}

async function handleStatus() {
  try {
    const pools = await fetchPools();
    const data = pools.map((p: any) => ({
      poolId: p.poolContract,
      poolName: p.tokens.tokenX.symbol + "-" + p.tokens.tokenY.symbol,
      tvlUsd: p.tvlUsd,
      feesUsd1d: p.feesUsd1d,
      apr24h: p.apr24h,
      apr30d: p.apr,
      feeYield24h: (p.feesUsd1d / p.tvlUsd) * 100,
    }));
    console.log(JSON.stringify({ status: "success", action: "status", data }, null, 2));
  } catch (error: any) {
    console.log(JSON.stringify({ status: "error", action: "status", error: error.message }, null, 2));
  }
}

async function handleRun() {
  try {
    const [appPools, quotesPools] = await Promise.all([fetchPools(), fetchQuotesPools()]);

    const quotesMap = new Map(quotesPools.map((q: any) => [q.pool_id, q]));

    const analyzed = appPools
      .filter((p: any) => p.tvlUsd >= 100 && p.feesUsd1d > 0)
      .map((p: any) => {
        const feeYield24h = (p.feesUsd1d / p.tvlUsd) * 100;
        const aprDivergence = p.apr24h - p.apr;
        let signal = "STABLE";
        let recommendedAction = "HOLD";

        if (aprDivergence > 50) {
          signal = "SPIKE";
          recommendedAction = `REPOSITION to ${p.poolId}`;
        } else if (aprDivergence < -20) {
          signal = "COOLING";
          recommendedAction = `EXIT ${p.poolId}`;
        }

        const quote = quotesMap.get(p.poolId);

        return {
          poolId: p.poolContract,
          poolName: p.tokens.tokenX.symbol + "-" + p.tokens.tokenY.symbol,
          tvlUsd: p.tvlUsd,
          feeYield24h,
          apr24h: p.apr24h,
          apr30d: p.apr,
          aprDivergence,
          signal,
          recommendedAction,
          activeBin: quote?.active_bin,
          binStep: quote?.bin_step,
        };
      })
      .sort((a: any, b: any) => b.feeYield24h - a.feeYield24h);

    console.log(JSON.stringify({
      status: "success",
      action: "run",
      data: analyzed.slice(0, 3)
    }, null, 2));
  } catch (error: any) {
    console.log(JSON.stringify({ status: "error", action: "run", error: error.message }, null, 2));
  }
}

async function handleDoctor() {
  try {
    const [appRes, quotesRes] = await Promise.all([
      fetch(`${API_BASE}/api/app/v1/pools`),
      fetch(`${API_BASE}/api/quotes/v1/pools`)
    ]);

    const data = {
      appApi: appRes.ok ? "connected" : "failed",
      quotesApi: quotesRes.ok ? "connected" : "failed",
    };

    console.log(JSON.stringify({ status: "success", action: "doctor", data }, null, 2));
  } catch (error: any) {
    console.log(JSON.stringify({ status: "error", action: "doctor", error: error.message }, null, 2));
  }
}

const args = process.argv.slice(2);
const command = args[0] || "run";

switch (command) {
  case "status":
    await handleStatus();
    break;
  case "run":
    await handleRun();
    break;
  case "doctor":
    await handleDoctor();
    break;
  default:
    console.log(JSON.stringify({ status: "error", error: `Unknown command: ${command}` }, null, 2));
}
