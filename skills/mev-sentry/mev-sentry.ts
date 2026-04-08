#!/usr/bin/env bun
import { Command } from "commander";

const program = new Command();

const HIRO_API_BASE = "https://api.mainnet.hiro.so";
const DEX_CONTRACTS = [
  "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9", // Alex
  "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM", // Bitflow
];

const FETCH_TIMEOUT_MS = 10_000;

function safeFeeRate(raw: unknown): number | null {
  const parsed = parseInt(String(raw));
  return isNaN(parsed) ? null : parsed;
}

function impactTier(feeRate: number, medianFeeRate: number): "low" | "medium" | "high" {
  if (feeRate > medianFeeRate * 3) return "high";
  if (feeRate > medianFeeRate * 1.5) return "medium";
  return "low";
}

function medianFeeRate(txs: any[]): number {
  const rates = txs
    .map((tx) => safeFeeRate(tx.fee_rate))
    .filter((r): r is number => r !== null)
    .sort((a, b) => a - b);
  if (rates.length === 0) return 1000;
  return rates[Math.floor(rates.length / 2)];
}

async function getMempool(limit: number = 50): Promise<any> {
  const response = await fetch(
    `${HIRO_API_BASE}/extended/v1/tx/mempool?limit=${limit}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  if (!response.ok) throw new Error(`Hiro API error: ${response.statusText}`);
  const data = await response.json();
  if (!Array.isArray(data.results)) {
    throw new Error(`Unexpected API response shape: ${JSON.stringify(data)}`);
  }
  return data;
}

async function analyzeTx(txId: string): Promise<any> {
  // Fetch the target transaction
  const txRes = await fetch(
    `${HIRO_API_BASE}/extended/v1/tx/${txId}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
  );
  if (!txRes.ok) throw new Error(`Hiro API error: ${txRes.statusText}`);
  const tx = await txRes.json();

  const feeRate = safeFeeRate(tx.fee_rate);
  if (feeRate === null) throw new Error(`Invalid fee_rate for tx ${txId}`);

  // Fetch mempool to get median fee rate and check for nonce competition
  const mempoolData = await getMempool(20);
  const median = medianFeeRate(mempoolData.results);

  // Nonce competition: other pending txs from same sender
  const competingTxs = mempoolData.results.filter(
    (t: any) => t.sender_address === tx.sender_address && t.tx_id !== txId
  );

  // Fee-bumping pattern: any competing tx from same sender with higher fee
  const feeBumping = competingTxs.some(
    (t: any) => (safeFeeRate(t.fee_rate) ?? 0) > feeRate
  );

  // Sandwich pattern: other pending DEX calls bracketing this one
  const isDexCall =
    tx.tx_type === "contract_call" &&
    DEX_CONTRACTS.includes(tx.contract_call?.contract_id?.split(".")[0]);

  const sandwichCandidates = isDexCall
    ? mempoolData.results.filter((t: any) => {
        if (t.tx_id === txId || t.tx_type !== "contract_call") return false;
        const addr = t.contract_call?.contract_id?.split(".")[0];
        return DEX_CONTRACTS.includes(addr);
      })
    : [];

  return {
    tx_id: tx.tx_id,
    sender: tx.sender_address,
    fee_rate: feeRate,
    median_mempool_fee_rate: median,
    fee_vs_median: `${((feeRate / median) * 100).toFixed(1)}%`,
    impact: impactTier(feeRate, median),
    is_dex_call: isDexCall,
    nonce_competition: {
      competing_tx_count: competingTxs.length,
      fee_bumping_detected: feeBumping,
    },
    sandwich_risk: {
      bracketing_dex_calls: sandwichCandidates.length,
      flagged: sandwichCandidates.length >= 2,
    },
    type: tx.tx_type,
    timestamp: new Date().toISOString(),
  };
}

program
  .name("mev-sentry")
  .description("Stacks mempool DEX call scanner with MEV heuristics")
  .version("2.0.0");

program
  .command("scout")
  .description("Scan mempool for pending DEX calls with impact assessment")
  .option("-l, --limit <number>", "Number of transactions to fetch", "50")
  .action(async (options) => {
    try {
      const data = await getMempool(parseInt(options.limit));
      const median = medianFeeRate(data.results);

      const results = data.results
        .filter((tx: any) => {
          if (tx.tx_type !== "contract_call") return false;
          const contractAddr = tx.contract_call.contract_id.split(".")[0];
          return DEX_CONTRACTS.includes(contractAddr);
        })
        .map((tx: any) => {
          const fee = safeFeeRate(tx.fee_rate) ?? 0;
          return {
            tx_id: tx.tx_id,
            sender: tx.sender_address,
            contract: tx.contract_call.contract_id,
            function: tx.contract_call.function_name,
            fee_rate: fee,
            estimated_impact: impactTier(fee, median),
          };
        });

      console.log(
        JSON.stringify(
          {
            mempool_size: data.total,
            median_fee_rate: median,
            dex_calls_found: results.length,
            high_value_calls: results,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );
    } catch (error: unknown) {
      console.log(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
      );
      process.exit(1);
    }
  });

program
  .command("analyze")
  .description("Analyze a specific transaction for MEV indicators")
  .option("-t, --txid <string>", "Transaction ID to analyze")
  .action(async (options) => {
    if (!options.txid) {
      console.log(JSON.stringify({ error: "Transaction ID is required" }));
      process.exit(1);
    }
    try {
      const result = await analyzeTx(options.txid);
      console.log(JSON.stringify(result, null, 2));
    } catch (error: unknown) {
      console.log(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
      );
      process.exit(1);
    }
  });

program
  .command("scan")
  .description("Single high-fidelity mempool scan — alerts on elevated-fee DEX calls")
  .action(async () => {
    try {
      const data = await getMempool(20);
      const median = medianFeeRate(data.results);

      const alerts = data.results
        .filter((tx: any) => {
          if (tx.tx_type !== "contract_call") return false;
          const addr = tx.contract_call.contract_id.split(".")[0];
          if (!DEX_CONTRACTS.includes(addr)) return false;
          const fee = safeFeeRate(tx.fee_rate) ?? 0;
          return fee > median * 1.5;
        })
        .map((tx: any) => {
          const fee = safeFeeRate(tx.fee_rate) ?? 0;
          return {
            tx_id: tx.tx_id,
            sender: tx.sender_address,
            contract: tx.contract_call.contract_id,
            function: tx.contract_call.function_name,
            fee_rate: fee,
            impact: impactTier(fee, median),
          };
        });

      console.log(
        JSON.stringify(
          {
            status: "complete",
            mempool_size: data.total,
            median_fee_rate: median,
            alerts_count: alerts.length,
            alerts,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );
    } catch (error: unknown) {
      console.log(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
      );
      process.exit(1);
    }
  });

program
  .command("doctor")
  .description("Check connectivity to the Hiro API")
  .action(async () => {
    try {
      const start = Date.now();
      const response = await fetch(`${HIRO_API_BASE}/extended/v1/status`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const latency = Date.now() - start;
      if (response.ok) {
        const data = await response.json();
        console.log(
          JSON.stringify(
            {
              status: "healthy",
              latency: `${latency}ms`,
              network: data.network_id,
              chain_tip: data.stacks_tip_height,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          )
        );
      } else {
        console.log(
          JSON.stringify({
            status: "unhealthy",
            error: `Hiro API returned ${response.status}`,
            timestamp: new Date().toISOString(),
          })
        );
        process.exit(1);
      }
    } catch (error: unknown) {
      console.log(
        JSON.stringify({
          status: "unhealthy",
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        })
      );
      process.exit(1);
    }
  });

program.parse();
