#!/usr/bin/env bun
import { Command } from "commander";
import fetch from "cross-fetch";

const program = new Command();

const HIRO_API_BASE = "https://api.mainnet.hiro.so";
const DEX_CONTRACTS = [
  "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9", // Alex
  "SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM", // Bitflow
];

async function getMempool(limit: number = 50) {
  try {
    const response = await fetch(`${HIRO_API_BASE}/extended/v1/tx/mempool?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Hiro API error: ${response.statusText}`);
    }
    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
}

async function analyzeTx(txId: string) {
  try {
    const response = await fetch(`${HIRO_API_BASE}/extended/v1/tx/${txId}`);
    if (!response.ok) {
      throw new Error(`Hiro API error: ${response.statusText}`);
    }
    const tx = await response.json();
    
    // Heuristic: Check for high fee relative to size
    const feeRate = parseInt(tx.fee_rate);
    const isHighFee = feeRate > 5000; // Simplified heuristic for example
    
    return {
      tx_id: tx.tx_id,
      sender: tx.sender_address,
      fee_rate: feeRate,
      is_potential_mev: isHighFee,
      type: tx.tx_type,
      timestamp: new Date().toISOString()
    };
  } catch (error: any) {
    return { error: error.message };
  }
}

program
  .name("mev-sentry")
  .description("Stacks mempool MEV monitor")
  .version("1.0.0");

program
  .command("scout")
  .description("Scout mempool for high-value DEX calls")
  .option("-l, --limit <number>", "Number of transactions to fetch", "50")
  .action(async (options) => {
    const data = await getMempool(parseInt(options.limit));
    
    if (data.error) {
      console.log(JSON.stringify(data));
      process.exit(1);
    }

    const results = data.results.filter((tx: any) => {
      if (tx.tx_type !== "contract_call") return false;
      const contractAddr = tx.contract_call.contract_id.split(".")[0];
      return DEX_CONTRACTS.includes(contractAddr);
    }).map((tx: any) => ({
      tx_id: tx.tx_id,
      sender: tx.sender_address,
      contract: tx.contract_call.contract_id,
      function: tx.contract_call.function_name,
      fee_rate: parseInt(tx.fee_rate),
      estimated_impact: parseInt(tx.fee_rate) > 5000 ? "high" : "low"
    }));

    console.log(JSON.stringify({
      mempool_size: data.total,
      high_value_calls: results,
      timestamp: new Date().toISOString()
    }, null, 2));
  });

program
  .command("analyze")
  .description("Deep analysis of a specific transaction")
  .option("-t, --txid <string>", "Transaction ID to analyze")
  .action(async (options) => {
    if (!options.txid) {
      console.log(JSON.stringify({ error: "Transaction ID is required for analysis" }));
      process.exit(1);
    }
    const result = await analyzeTx(options.txid);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("watch")
  .description("Continuously monitor mempool for MEV signatures")
  .option("-i, --interval <number>", "Polling interval in seconds", "10")
  .action(async (options) => {
    console.log(JSON.stringify({
      status: "starting",
      mode: "polling",
      interval: `${options.interval}s`,
      timestamp: new Date().toISOString()
    }));
    
    // In a real CLI this would loop, but for agent-skill compliance 
    // we perform one high-fidelity scan per invocation or return a 'watching' state.
    const data = await getMempool(100);
    if (data.error) {
      console.log(JSON.stringify(data));
      process.exit(1);
    }
    
    const alerts = data.results.filter((tx: any) => parseInt(tx.fee_rate) > 10000);
    
    console.log(JSON.stringify({
      status: "active",
      current_alerts: alerts.length,
      top_alert: alerts.length > 0 ? alerts[0].tx_id : null,
      timestamp: new Date().toISOString()
    }, null, 2));
  });

program.parse();
