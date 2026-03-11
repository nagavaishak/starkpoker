/**
 * p2-finish.ts — P2 check + reveal hand (game already at Playing phase)
 */
import { RpcProvider } from "starknet";
import { buildAccount, PokerContractClient } from "../src/starknet.js";

const GAME_ADDRESS   = "0x214feb287b4e3892646c78d4d7a24e8a5b810858187c03ecc423838fd2f4781";
const STRK_ADDRESS   = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const RPC_URL        = "https://api.cartridge.gg/x/starknet/sepolia";
const P2_ADDRESS     = "0x0688b2fd40580944024e7cc5dab915a80d892f8a404911d4d171ab08322fb0fb";
const P2_PRIVATE_KEY = "0x0260c0f93e326ef62f8f46d49f5156dad19abf2451520d7f727cea9115931ccc";
const GAME_ID        = "0";

// P2 reveals a straight flush: 9♠ T♠ J♠ Q♠ K♠
const P2_HAND: [number,number,number,number,number] = [47, 48, 49, 50, 51];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function poll<T>(label: string, fn: () => Promise<T|null>): Promise<T> {
  process.stdout.write(`⏳ ${label}`);
  for (;;) {
    const v = await fn();
    if (v !== null) { console.log(" ✓"); return v; }
    process.stdout.write(".");
    await sleep(5000);
  }
}

async function main() {
  const account = buildAccount(RPC_URL, P2_ADDRESS, P2_PRIVATE_KEY);
  const client  = new PokerContractClient(RPC_URL, { gameAddress: GAME_ADDRESS, strkAddress: STRK_ADDRESS });

  const phase = await client.getGamePhase(GAME_ID);
  const phases = ['WaitingForPlayer2','RegisteringKeys','Shuffling','Playing','Showdown','Done'];
  console.log(`Current phase: ${phases[phase]} (${phase})`);

  // ── Check ─────────────────────────────────────────────────────────────────
  if (phase <= 3) {
    console.log("\n[1] P2 checks...");
    try {
      await client.checkAction(account as any, GAME_ID);
      console.log("    ✅ P2 checked");
    } catch (e: any) {
      if (e.message?.includes("WRONG_PHASE") || e.message?.includes("ALREADY")) {
        console.log("    ⚠ Already checked or not needed — continuing");
      } else throw e;
    }
  }

  // ── Wait for Showdown ─────────────────────────────────────────────────────
  await poll("Showdown (waiting for P1 to also check)", async () => {
    const p = await client.getGamePhase(GAME_ID);
    return p >= 4 ? p : null;
  });

  // ── Reveal P2 hand ────────────────────────────────────────────────────────
  console.log("\n[2] Revealing P2 hand:", P2_HAND);
  console.log("    9♠ T♠ J♠ Q♠ K♠  — King-high straight flush");
  await client.revealHand(account as any, GAME_ID, P2_HAND);
  console.log("    ✅ P2 hand revealed!");

  // ── Check result ──────────────────────────────────────────────────────────
  const finalPhase = await client.getGamePhase(GAME_ID);
  const pot = await client.getPot(GAME_ID);
  console.log(`\nFinal phase: ${phases[finalPhase]}`);
  console.log(`Pot: ${Number(pot) / 1e18} STRK`);

  if (finalPhase === 5) {
    console.log("\n🏆 Game settled on-chain!");
  } else {
    console.log("\n→ P1 still needs to reveal their hand in the browser.");
  }
}

main().catch(err => {
  console.error("\n❌ Fatal:", err.message ?? err);
  process.exit(1);
});
