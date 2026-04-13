#!/usr/bin/env bun
/**
 * HODLMM Bin Exit skill CLI
 * Autonomous circuit breaker — monitors HODLMM volatility and removes
 * liquidity from active bins when crisis threshold is breached.
 *
 * HODLMM bonus eligible: Yes — directly interacts with HODLMM contract.
 *
 * Usage: bun run hodlmm-bin-exit/hodlmm-bin-exit.ts <subcommand> [options]
 */
import { Command } from "commander";
import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  uintCV,
  listCV,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { STACKS_MAINNET } from "@stacks/network";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BITFLOW_API = "https://api.bitflow.finance/api/v1";
const NETWORK = "mainnet";
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_THRESHOLD = 61;
const DEFAULT_MAX_FEE = 10_000; // microstacks

// HODLMM contract on Stacks mainnet
const HODLMM_CONTRACT_ADDRESS = "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS";
const HODLMM_CONTRACT_NAME = "hodlmm-v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface HodlmmBinData {
  bin_id: number;
  reserve_x: string;
  reserve_y: string;
}

interface HodlmmPoolInfo {
  active_bin: number;
  token_x: string;
  token_y: string;
  token_x_symbol?: string;
  token_y_symbol?: string;
}

interface HodlmmBinListResponse {
  active_bin_id?: number;
  bins: HodlmmBinData[];
}

interface RiskMetrics {
  activeBinId: number;
  totalBins: number;
  binSpread: number;
  reserveImbalanceRatio: number;
  volatilityScore: number;
  regime: "calm" | "elevated" | "crisis";
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data as T;
}

async function getHodlmmPool(poolId: string): Promise<HodlmmPoolInfo> {
  return fetchJson<HodlmmPoolInfo>(`${BITFLOW_API}/hodlmm/pools/${poolId}`);
}

async function getHodlmmPoolBins(poolId: string): Promise<HodlmmBinListResponse> {
  return fetchJson<HodlmmBinListResponse>(`${BITFLOW_API}/hodlmm/pools/${poolId}/bins`);
}

async function getHodlmmUserPositionBins(
  address: string,
  poolId: string
): Promise<HodlmmBinListResponse> {
  return fetchJson<HodlmmBinListResponse>(
    `${BITFLOW_API}/hodlmm/pools/${poolId}/positions/${address}`
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function printJson(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data, null, 2));
}

function handleError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify({ error: message }, null, 2));
  process.exit(1);
}

function getPrivateKey(): string {
  const key =
    process.env.STACKS_PRIVATE_KEY ||
    process.env.STX_PRIVATE_KEY ||
    process.env.WALLET_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "No private key found. Set STACKS_PRIVATE_KEY, STX_PRIVATE_KEY, or WALLET_PRIVATE_KEY env var."
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Risk computation (mirrors hodlmm-risk conventions)
// ---------------------------------------------------------------------------
function classifyRegime(score: number): "calm" | "elevated" | "crisis" {
  if (score <= 30) return "calm";
  if (score <= 60) return "elevated";
  return "crisis";
}

function computePoolRiskMetrics(
  pool: HodlmmPoolInfo,
  binsResponse: HodlmmBinListResponse
): RiskMetrics {
  const bins = binsResponse.bins;
  const activeBinId = binsResponse.active_bin_id ?? pool.active_bin;

  if (activeBinId == null) {
    throw new Error("Cannot determine active bin from pool or bins response");
  }

  const nonEmptyBins = bins.filter(
    (b) => Number(b.reserve_x) > 0 || Number(b.reserve_y) > 0
  );
  if (nonEmptyBins.length === 0) {
    throw new Error("No active liquidity in this pool — all bins are empty");
  }

  const binIds = nonEmptyBins.map((b) => b.bin_id);
  const minBin = Math.min(...binIds);
  const maxBin = Math.max(...binIds);
  const binSpread =
    bins.length > 0 ? (maxBin - minBin) / Math.max(bins.length, 1) : 0;

  let totalX = 0;
  let totalY = 0;
  for (const bin of bins) {
    totalX += Number(bin.reserve_x);
    totalY += Number(bin.reserve_y);
  }
  const totalReserves = totalX + totalY;
  const reserveImbalanceRatio =
    totalReserves > 0 ? Math.abs(totalX - totalY) / totalReserves : 0;

  const activeBin = bins.find((b) => b.bin_id === activeBinId);
  const activeLiquidity = activeBin
    ? Number(activeBin.reserve_x) + Number(activeBin.reserve_y)
    : 0;
  const activeBinConcentration =
    totalReserves > 0 ? activeLiquidity / totalReserves : 0;

  const spreadScore = Math.min(binSpread * 100, 40);
  const imbalanceScore = reserveImbalanceRatio * 30;
  const concentrationScore = (1 - activeBinConcentration) * 30;

  const volatilityScore = Math.round(
    Math.min(spreadScore + imbalanceScore + concentrationScore, 100)
  );

  return {
    activeBinId,
    totalBins: bins.length,
    binSpread: Number(binSpread.toFixed(4)),
    reserveImbalanceRatio: Number(reserveImbalanceRatio.toFixed(4)),
    volatilityScore,
    regime: classifyRegime(volatilityScore),
  };
}

function computeDriftScore(
  positionBins: HodlmmBinData[],
  activeBinId: number
): { driftScore: number; nearestOffset: number; avgOffset: number } {
  const offsets = positionBins.map((b) => Math.abs(b.bin_id - activeBinId));
  const nearestOffset = Math.min(...offsets);
  const avgOffset = offsets.reduce((s, o) => s + o, 0) / offsets.length;
  const driftScore = Math.round(Math.min(avgOffset * 5, 100));
  return { driftScore, nearestOffset, avgOffset: Number(avgOffset.toFixed(2)) };
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------
const program = new Command();
program
  .name("hodlmm-bin-exit")
  .description(
    "HODLMM autonomous circuit breaker — exits LP position when volatility crosses crisis threshold"
  )
  .version("1.0.0");

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------
program
  .command("doctor")
  .description(
    "Check environment readiness: wallet, Bitflow API, and pool existence."
  )
  .requiredOption("--pool-id <id>", "HODLMM pool identifier (e.g. dlmm_3)")
  .action(async (opts: { poolId: string }) => {
    const checks: Record<string, unknown> = {};

    // Wallet check
    try {
      const key = getPrivateKey();
      const address = getAddressFromPrivateKey(key);
      checks["wallet"] = { ok: true, address };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      checks["wallet"] = { ok: false, error: msg };
    }

    // API reachability + pool existence (single fetch)
    try {
      const pool = await fetchJson<HodlmmPoolInfo>(
        `${BITFLOW_API}/hodlmm/pools/${opts.poolId}`
      );
      checks["bitflow_api"] = { ok: true };
      checks["pool"] = {
        ok: true,
        poolId: opts.poolId,
        tokenX: pool.token_x_symbol || pool.token_x,
        tokenY: pool.token_y_symbol || pool.token_y,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      checks["bitflow_api"] = { ok: false, error: msg };
      checks["pool"] = { ok: false, error: msg };
    }

    const allOk = Object.values(checks).every(
      (c) => (c as { ok: boolean }).ok === true
    );

    printJson({
      result: allOk ? "ready" : "not_ready",
      network: NETWORK,
      checks,
      timestamp: new Date().toISOString(),
    });

    if (!allOk) process.exit(1);
  });

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
program
  .command("status")
  .description(
    "Read-only check — returns volatility regime and whether exit conditions are met."
  )
  .requiredOption("--pool-id <id>", "HODLMM pool identifier")
  .requiredOption("--address <addr>", "Stacks address to check position for")
  .option("--threshold <number>", "Volatility score exit threshold", String(DEFAULT_THRESHOLD))
  .action(async (opts: { poolId: string; address: string; threshold: string }) => {
    try {
      const threshold = Number(opts.threshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        throw new Error("--threshold must be a number between 0 and 100");
      }

      const [pool, binsResponse, positionResponse] = await Promise.all([
        getHodlmmPool(opts.poolId),
        getHodlmmPoolBins(opts.poolId),
        getHodlmmUserPositionBins(opts.address, opts.poolId),
      ]);

      if (!binsResponse.bins || binsResponse.bins.length === 0) {
        throw new Error("No bins returned for this pool");
      }

      const positionBins = positionResponse.bins;
      if (!positionBins || positionBins.length === 0) {
        throw new Error("Address has no position in this pool");
      }

      const metrics = computePoolRiskMetrics(pool, binsResponse);
      const activeBinId = binsResponse.active_bin_id ?? pool.active_bin;
      const { driftScore } = computeDriftScore(positionBins, activeBinId);
      const exitConditionMet = metrics.volatilityScore >= threshold;

      printJson({
        network: NETWORK,
        poolId: opts.poolId,
        address: opts.address,
        volatilityScore: metrics.volatilityScore,
        regime: metrics.regime,
        positionBinCount: positionBins.length,
        driftScore,
        exitConditionMet,
        threshold,
        action: exitConditionMet ? "exit" : "hold",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      handleError(error);
    }
  });

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
program
  .command("run")
  .description(
    "Execute circuit breaker — removes liquidity from all position bins if volatility threshold is met."
  )
  .requiredOption("--pool-id <id>", "HODLMM pool identifier")
  .requiredOption("--address <addr>", "Stacks address holding the position")
  .option("--threshold <number>", "Volatility score exit threshold", String(DEFAULT_THRESHOLD))
  .option("--max-fee <number>", "Maximum fee in microstacks", String(DEFAULT_MAX_FEE))
  .action(
    async (opts: {
      poolId: string;
      address: string;
      threshold: string;
      maxFee: string;
    }) => {
      try {
        const threshold = Number(opts.threshold);
        const maxFee = Number(opts.maxFee);

        if (isNaN(threshold) || threshold < 0 || threshold > 100) {
          throw new Error("--threshold must be a number between 0 and 100");
        }
        if (isNaN(maxFee) || maxFee <= 0) {
          throw new Error("--max-fee must be a positive number");
        }

        // Step 1: load wallet + validate address matches signer
        const privateKey = getPrivateKey();
        const signerAddress = getAddressFromPrivateKey(privateKey, STACKS_MAINNET);

        if (signerAddress !== opts.address) {
          throw new Error(
            `--address ${opts.address} does not match wallet signer ${signerAddress}`
          );
        }

        // Step 2: fetch pool state + position
        const [pool, binsResponse, positionResponse] = await Promise.all([
          getHodlmmPool(opts.poolId),
          getHodlmmPoolBins(opts.poolId),
          getHodlmmUserPositionBins(opts.address, opts.poolId),
        ]);

        if (!binsResponse.bins || binsResponse.bins.length === 0) {
          throw new Error("No bins returned for this pool");
        }

        const positionBins = positionResponse.bins;
        if (!positionBins || positionBins.length === 0) {
          throw new Error("Address has no position in this pool");
        }

        // Step 3: compute risk
        const metrics = computePoolRiskMetrics(pool, binsResponse);

        // Step 4: threshold gate — hold if not crisis
        if (metrics.volatilityScore < threshold) {
          printJson({
            status: "success",
            action: "hold",
            poolId: opts.poolId,
            volatilityScore: metrics.volatilityScore,
            regime: metrics.regime,
            threshold,
            message: "Volatility below exit threshold. Position held.",
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Step 5: build bin id list for removal
        const binIds = positionBins.map((b) => b.bin_id);

        // Step 6: fee guard
        if (maxFee > DEFAULT_MAX_FEE * 10) {
          throw new Error(
            `Requested max-fee ${maxFee} exceeds safety ceiling ${DEFAULT_MAX_FEE * 10} microstacks`
          );
        }

        // Step 7: build and broadcast remove-liquidity transaction
        const network = STACKS_MAINNET;

        const tx = await makeContractCall({
          contractAddress: HODLMM_CONTRACT_ADDRESS,
          contractName: HODLMM_CONTRACT_NAME,
          functionName: "remove-liquidity",
          functionArgs: [
            listCV(binIds.map((id) => uintCV(id))),
          ],
          senderKey: privateKey,
          network,
          anchorMode: AnchorMode.Any,
          postConditionMode: PostConditionMode.Allow,
          fee: maxFee,
        });

        const broadcastResult = await broadcastTransaction(tx, network);

        if (broadcastResult.error) {
          throw new Error(`Broadcast failed: ${broadcastResult.error}`);
        }

        const txid =
          typeof broadcastResult === "string"
            ? broadcastResult
            : (broadcastResult as { txid?: string }).txid ?? JSON.stringify(broadcastResult);

        printJson({
          status: "success",
          action: "exited",
          txid,
          poolId: opts.poolId,
          signerAddress,
          binsExited: binIds,
          volatilityScore: metrics.volatilityScore,
          regime: metrics.regime,
          threshold,
          fee: maxFee,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        handleError(error);
      }
    }
  );

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------
program.parse();
