#!/usr/bin/env bun
import { Command } from 'commander';
import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  listCV,
  tupleCV,
  intCV,
  uintCV,
  contractPrincipalCV,
} from '@stacks/transactions';
import { STACKS_MAINNET } from '@stacks/network';

const BITFLOW_API = "https://api.bitflow.finance/api/v1";
const ROUTER_CONTRACT_NAME = "dlmm-liquidity-router-v-0-1";
const DRIFT_THRESHOLD = 10;
const MAX_FEE = 400000n;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json() as Promise<T>;
}

async function getSTXBalance(address: string): Promise<bigint> {
  const res = await fetchJson<{ balance: string }>(
    `https://api.hiro.so/extended/v1/address/${address}/stx`
  );
  return BigInt(res.balance);
}

interface PoolInfo {
  active_bin: number;
  token_x_contract: string;
  token_y_contract: string;
  contract_address: string;
}

interface PositionBin {
  bin_id: number;
  amount: number;
}

interface BinListResponse {
  bins: PositionBin[];
  active_bin_id?: number;
}

const program = new Command();
program
  .name('hodlmm-auto-rebalancer')
  .description('Autonomously rebalance HODLMM positions when bin drift occurs');

program
  .command('doctor')
  .description('Check environment and connectivity')
  .action(async () => {
    const envCheck = {
      STACKS_PRIVATE_KEY: !!process.env.STACKS_PRIVATE_KEY,
      ROUTER_ADDRESS: !!process.env.ROUTER_ADDRESS,
      STX_ADDRESS: !!process.env.STX_ADDRESS,
    };

    let apiReachable = false;
    let poolCount = 0;
    let balanceOk = false;

    try {
      const data = await fetchJson<{ data: unknown[] }>(`${BITFLOW_API}/hodlmm/pools`);
      apiReachable = true;
      poolCount = data.data?.length ?? 0;
    } catch (_) {}

    if (process.env.STX_ADDRESS) {
      try {
        const balance = await getSTXBalance(process.env.STX_ADDRESS);
        balanceOk = balance >= MAX_FEE;
      } catch (_) {}
    }

    const allGood = Object.values(envCheck).every(Boolean) && apiReachable && balanceOk;

    console.log(JSON.stringify({
      status: allGood ? "success" : "error",
      env: envCheck,
      connectivity: {
        bitflow_api: apiReachable ? `reachable — ${poolCount} pools` : "unreachable",
      },
      balance: {
        sufficient_for_gas: balanceOk,
        required_microSTX: MAX_FEE.toString(),
      },
      network: "mainnet",
    }));
  });

program
  .command('check')
  .description('Check if LP position has drifted from active bin')
  .requiredOption('-p, --pool <id>', 'HODLMM pool ID (e.g. dlmm_1)')
  .action(async (options) => {
    try {
      if (!process.env.STX_ADDRESS) throw new Error("Missing STX_ADDRESS");

      const [pool, position] = await Promise.all([
        fetchJson<PoolInfo>(`${BITFLOW_API}/hodlmm/pools/${options.pool}`),
        fetchJson<BinListResponse>(`${BITFLOW_API}/hodlmm/pools/${options.pool}/positions/${process.env.STX_ADDRESS}`),
      ]);

      const activeBin = pool.active_bin;
      const userBins = position.bins ?? [];

      if (userBins.length === 0) {
        console.log(JSON.stringify({
          status: "success",
          action: "no_position",
          data: { pool: options.pool, message: "No active position found for this address." },
          error: null,
        }));
        return;
      }

      const totalAmount = userBins.reduce((sum, b) => sum + b.amount, 0);
      const weightedCenter = totalAmount > 0
        ? Math.round(userBins.reduce((sum, b) => sum + b.bin_id * b.amount, 0) / totalAmount)
        : userBins[0].bin_id;

      const drift = Math.abs(activeBin - weightedCenter);

      if (drift > DRIFT_THRESHOLD) {
        console.log(JSON.stringify({
          status: "success",
          action: "rebalance_required",
          data: { pool: options.pool, activeBin, userCenter: weightedCenter, drift, threshold: DRIFT_THRESHOLD },
          error: null,
        }));
      } else {
        console.log(JSON.stringify({
          status: "success",
          action: "hold",
          data: { pool: options.pool, activeBin, userCenter: weightedCenter, drift, message: "Position optimal." },
          error: null,
        }));
      }
    } catch (err: any) {
      console.log(JSON.stringify({ status: "error", action: null, data: null, error: err.message }));
    }
  });

program
  .command('rebalance')
  .description('Move liquidity to current active bin')
  .requiredOption('-p, --pool <id>', 'HODLMM pool ID (e.g. dlmm_1)')
  .action(async (options) => {
    try {
      if (!process.env.STACKS_PRIVATE_KEY) throw new Error("Missing STACKS_PRIVATE_KEY");
      if (!process.env.ROUTER_ADDRESS) throw new Error("Missing ROUTER_ADDRESS");
      if (!process.env.STX_ADDRESS) throw new Error("Missing STX_ADDRESS");

      const balance = await getSTXBalance(process.env.STX_ADDRESS);
      if (balance < MAX_FEE) {
        throw new Error(`Insufficient STX balance. Need ${MAX_FEE} microSTX, have ${balance}`);
      }

      const [pool, position] = await Promise.all([
        fetchJson<PoolInfo>(`${BITFLOW_API}/hodlmm/pools/${options.pool}`),
        fetchJson<BinListResponse>(`${BITFLOW_API}/hodlmm/pools/${options.pool}/positions/${process.env.STX_ADDRESS}`),
      ]);

      const activeBin = pool.active_bin;
      const userBins = (position.bins ?? []).filter(b => b.amount > 0);

      if (userBins.length === 0) throw new Error("No active position to rebalance");

      const totalAmount = userBins.reduce((sum, b) => sum + b.amount, 0);
      const weightedCenter = Math.round(
        userBins.reduce((sum, b) => sum + b.bin_id * b.amount, 0) / totalAmount
      );
      const drift = Math.abs(activeBin - weightedCenter);

      if (drift <= DRIFT_THRESHOLD) {
        console.log(JSON.stringify({
          status: "success",
          action: "hold",
          data: { activeBin, drift, message: "Drift within threshold. No rebalance needed." },
          error: null,
        }));
        return;
      }

      const [routerAddress] = process.env.ROUTER_ADDRESS.split('.');
      const [poolContractAddress, poolContractName] = pool.contract_address.split('.');
      const [xAddress, xName] = pool.token_x_contract.split('.');
      const [yAddress, yName] = pool.token_y_contract.split('.');

      const positions = userBins.map(bin => tupleCV({
        'pool-trait': contractPrincipalCV(poolContractAddress, poolContractName),
        'x-token-trait': contractPrincipalCV(xAddress, xName),
        'y-token-trait': contractPrincipalCV(yAddress, yName),
        'from-bin-id': intCV(bin.bin_id),
        'to-bin-id': intCV(activeBin),
        'amount': uintCV(bin.amount),
        'min-dlp': uintCV(0),
        'max-x-liquidity-fee': uintCV(1000000),
        'max-y-liquidity-fee': uintCV(1000000),
      }));

      const txOptions = {
        contractAddress: routerAddress,
        contractName: ROUTER_CONTRACT_NAME,
        functionName: 'move-liquidity-multi',
        functionArgs: [listCV(positions)],
        senderKey: process.env.STACKS_PRIVATE_KEY,
        validateWithAbi: false,
        network: STACKS_MAINNET,
        // Allow mode: router delegates to dlmm-core; no direct token transfer from sender.
        // @stacks/transactions v7 removed makeStandardSTXPostCondition.
        postConditionMode: PostConditionMode.Allow,
        postConditions: [],
        anchorMode: AnchorMode.Any,
        fee: Number(MAX_FEE),
      };

      const transaction = await makeContractCall(txOptions);
      const broadcastResponse = await broadcastTransaction({ transaction, network: STACKS_MAINNET });

      console.log(JSON.stringify({
        status: "success",
        action: "rebalance_executed",
        data: { txid: broadcastResponse.txid, activeBin, movedBins: userBins.length },
        error: null,
      }));
    } catch (err: any) {
      console.log(JSON.stringify({ status: "error", action: null, data: null, error: err.message }));
    }
  });

program.parse(process.argv);
