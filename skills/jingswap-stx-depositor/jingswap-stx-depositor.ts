import { Command } from "commander";
import { 
  jingswap_get_cycle_state, 
  jingswap_deposit_stx,
  jingswap_get_user_deposit,
  mcp_aibtc_get_stx_balance,
  mcp_aibtc_wallet_status
} from "../src/lib/mcp";

const program = new Command();

const SPENDING_LIMIT_STX = 5;
const BALANCE_RESERVE_STX = 10;
const MIN_DEPOSIT_STX = 1;

program
  .name("jingswap-stx-depositor")
  .description("Autonomously unlock deadlocked JingSwap auction cycles");

program
  .command("status")
  .description("Check if the current sBTC-STX cycle is deadlocked")
  .action(async () => {
    try {
      const state = await jingswap_get_cycle_state({ market: "sbtc-stx" });
      const isDeadlocked = 
        state.phase === 0 && 
        state.blocksElapsed >= 150 && 
        state.totalTokenB === 0 && 
        state.totalSbtc > 0;

      console.log(JSON.stringify({
        status: "success",
        data: {
          cycle: state.cycle,
          phase: state.phase,
          blocksElapsed: state.blocksElapsed,
          totalSbtc: state.totalSbtc,
          totalStx: state.totalTokenB,
          isDeadlocked
        }
      }));
    } catch (error) {
      console.log(JSON.stringify({ status: "error", error: error.message }));
    }
  });

program
  .command("run")
  .description("Execute deposit if cycle is deadlocked")
  .option("--dry-run", "Simulate the action without depositing")
  .action(async (options) => {
    try {
      // 1. Check wallet status
      const wallet = await mcp_aibtc_wallet_status({});
      if (!wallet.isUnlocked) {
        throw new Error("Wallet is locked. Action blocked.");
      }

      // 2. Check balance safety
      const balanceInfo = await mcp_aibtc_get_stx_balance({ address: wallet.wallet.address });
      const currentMicroStx = BigInt(balanceInfo.balance.microStx);
      const reserveMicroStx = BigInt(BALANCE_RESERVE_STX * 1_000_000);

      if (currentMicroStx < reserveMicroStx) {
        console.log(JSON.stringify({ 
          status: "blocked", 
          reason: "Insufficient balance", 
          current: balanceInfo.balance.stx, 
          required_reserve: `${BALANCE_RESERVE_STX} STX` 
        }));
        return;
      }

      // 3. Detect Deadlock
      const state = await jingswap_get_cycle_state({ market: "sbtc-stx" });
      const isDeadlocked = 
        state.phase === 0 && 
        state.blocksElapsed >= 150 && 
        state.totalTokenB === 0 && 
        state.totalSbtc > 0;

      if (!isDeadlocked) {
        console.log(JSON.stringify({ status: "success", action: "none", reason: "No deadlock detected" }));
        return;
      }

      // 4. Double-Deposit Protection
      const userDeposit = await jingswap_get_user_deposit({ 
        address: wallet.wallet.address, 
        cycle: state.cycle, 
        market: "sbtc-stx" 
      });

      if (userDeposit.tokenB > 0) {
        console.log(JSON.stringify({ status: "success", action: "none", reason: "Already deposited in this cycle" }));
        return;
      }

      // 5. Action
      if (options.dryRun) {
        console.log(JSON.stringify({ 
          status: "success", 
          action: "simulate_deposit", 
          amount: `${MIN_DEPOSIT_STX} STX`,
          cycle: state.cycle 
        }));
        return;
      }

      const result = await jingswap_deposit_stx({ 
        amount: MIN_DEPOSIT_STX, 
        market: "sbtc-stx" 
      });

      console.log(JSON.stringify({
        status: "success",
        action: "deposit_executed",
        data: {
          txid: result.txid,
          amount: `${MIN_DEPOSIT_STX} STX`,
          cycle: state.cycle
        }
      }));

    } catch (error) {
      console.log(JSON.stringify({ status: "error", error: error.message }));
    }
  });

program
  .command("doctor")
  .description("Check connectivity and wallet readiness")
  .action(async () => {
    try {
      const wallet = await mcp_aibtc_wallet_status({});
      const balance = await mcp_aibtc_get_stx_balance({ address: wallet.wallet?.address });
      
      console.log(JSON.stringify({
        status: "success",
        data: {
          walletConnected: !!wallet.wallet,
          isUnlocked: wallet.isUnlocked,
          network: wallet.currentNetwork,
          address: wallet.wallet?.address,
          balance: balance.balance.stx
        }
      }));
    } catch (error) {
      console.log(JSON.stringify({ status: "error", error: error.message }));
    }
  });

program.parse();
