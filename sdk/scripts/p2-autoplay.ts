/**
 * p2-autoplay.ts — Full P2 game automation for StarkPoker (Sepolia)
 *
 * Phases handled:
 *   1. Register Baby Jubjub public key
 *   2. Wait for P1 to register their key
 *   3. Compute aggregate public key (APK = PK1 + PK2)
 *   4. Wait for P1 to submit masked deck
 *   5. Read P1's deck from chain, rerandomize + shuffle
 *   6. Submit P2 shuffle on-chain
 *   7. Check (advance to showdown)
 *   8. Real card recovery: submit partial decrypts, wait for P1's, recover actual cards
 *   9. Reveal P2's real hand on-chain → triggers settlement
 */

import { RpcProvider } from "starknet";
import { buildAccount, PokerContractClient, deckToCalldata } from "../src/starknet.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const GAME_ADDRESS   = "0x7473a8171b2489dfef7d0b450c8a4136e7cf1ca8e2b67064b5cc33389c77261";
const STRK_ADDRESS   = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const RPC_URL        = "https://api.cartridge.gg/x/starknet/sepolia";

const P2_ADDRESS     = "0x0688b2fd40580944024e7cc5dab915a80d892f8a404911d4d171ab08322fb0fb";
const P2_PRIVATE_KEY = "0x0260c0f93e326ef62f8f46d49f5156dad19abf2451520d7f727cea9115931ccc";

const GAME_ID        = process.argv[2] ?? "7";

// P1 holds slots 0-4, P2 holds slots 5-9 (post-shuffle deal)
const P1_SLOTS = [0, 1, 2, 3, 4];
const P2_SLOTS = [5, 6, 7, 8, 9];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function poll<T>(
  label: string,
  fn: () => Promise<T | null>,
  intervalMs = 5000,
): Promise<T> {
  process.stdout.write(`⏳ ${label}`);
  for (;;) {
    const v = await fn();
    if (v !== null) { console.log(" ✓"); return v; }
    process.stdout.write(".");
    await sleep(intervalMs);
  }
}

function u256pair(low: string, high: string): bigint {
  return BigInt(low) + BigInt(high) * (1n << 128n);
}

async function callView(provider: RpcProvider, entry: string, args: string[]) {
  return provider.callContract({
    contractAddress: GAME_ADDRESS,
    entrypoint: entry,
    calldata: args,
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════╗");
  console.log("║   StarkPoker — P2 Autoplay       ║");
  console.log("╚══════════════════════════════════╝");
  console.log(`Game:   ${GAME_ID}`);
  console.log(`P2:     ${P2_ADDRESS}\n`);

  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account  = buildAccount(RPC_URL, P2_ADDRESS, P2_PRIVATE_KEY);
  const client   = new PokerContractClient(RPC_URL, {
    gameAddress: GAME_ADDRESS,
    strkAddress: STRK_ADDRESS,
  });

  // Import Baby Jubjub library
  const {
    generateKeypair,
    computeAggregateKey,
    rerandomizeDeck,
    partialDecrypt,
    recoverCard,
  } = await import("babyjubjub-starknet");

  // ── 1. Wait for game to appear on-chain, then check phase ─────────────────
  process.stdout.write("⏳ Waiting for game to confirm on-chain");
  while (true) {
    const pot = await client.getPot(GAME_ID);
    if (pot > 0n) break;
    process.stdout.write(".");
    await sleep(4000);
  }
  console.log(" ✓");

  const currentPhase = await client.getGamePhase(GAME_ID);
  const p1Addr       = await client.getPlayer1(GAME_ID);
  const p2Addr       = await client.getPlayer2(GAME_ID);
  console.log(`[phase] ${currentPhase} | P1: ${p1Addr.slice(0,10)}... P2: ${p2Addr.slice(0,10)}...`);

  let kp2: any;

  if (currentPhase === 0) {
    console.log("\n[0] Joining game as P2...");
    await client.joinGame(account as any, GAME_ID);
    console.log("    ✅ P2 joined!");
  }

  // ── 2. Generate + register P2 keypair ─────────────────────────────────────
  if (currentPhase <= 1) {
    console.log("\n[1] Generating P2 Baby Jubjub keypair...");
    kp2 = await generateKeypair();
    console.log(`    pk.x = 0x${kp2.publicKey.x.toString(16).slice(0, 20)}...`);

    // Check if P2 key already registered
    try {
      const existing = await callView(provider, "get_pk_x", [GAME_ID, P2_ADDRESS]);
      if (BigInt(existing[0]) !== 0n) {
        console.log("    ⚠ P2 key already on chain — skipping registration");
      } else {
        console.log("\n[2] Registering P2 public key on-chain...");
        await client.registerPublicKey(account as any, GAME_ID, kp2.publicKey.x, kp2.publicKey.y);
        console.log("    ✅ Done");
      }
    } catch {
      console.log("\n[2] Registering P2 public key on-chain...");
      await client.registerPublicKey(account as any, GAME_ID, kp2.publicKey.x, kp2.publicKey.y);
      console.log("    ✅ Done");
    }
  } else {
    // Phase already past RegisteringKeys — generate fresh keypair
    // Note: in a real game this would be persisted; for demo we use a fixed key
    console.log("[1-2] Skipped (already past key registration)");
    kp2 = await generateKeypair();
  }

  // ── 3. Wait for P1 to register their key ──────────────────────────────────
  const p1Key = await poll("P1 key registration", async () => {
    try {
      const xr = await callView(provider, "get_pk_x", [GAME_ID, p1Addr]);
      const yr = await callView(provider, "get_pk_y", [GAME_ID, p1Addr]);
      const x  = u256pair(xr[0], xr[1]);
      if (x === 0n) return null;
      return { x, y: u256pair(yr[0], yr[1]) };
    } catch { return null; }
  });
  console.log(`    P1 pk.x = 0x${p1Key.x.toString(16).slice(0, 20)}...`);

  // ── 4. Compute APK ────────────────────────────────────────────────────────
  console.log("\n[4] Computing APK = PK1 + PK2...");
  const apk = await computeAggregateKey(p1Key, kp2.publicKey);
  console.log(`    APK.x = 0x${apk.x.toString(16).slice(0, 20)}...`);

  // ── 5. Wait for P1 to submit masked deck (shuffle_step → 1) ───────────────
  await poll("P1 masked deck (shuffle_step ≥ 1)", async () => {
    const s = await client.getShuffleStep(GAME_ID);
    return s >= 1 ? s : null;
  });

  // ── 6. Read P1's deck from chain ──────────────────────────────────────────
  console.log("\n[6] Reading P1 deck from chain (52 × 8 felts = 416 reads)...");
  const flatFelts: string[] = [];
  for (let i = 0; i < 416; i++) {
    const r = await callView(provider, "get_deck_felt", [GAME_ID, i.toString()]);
    flatFelts.push(r[0]);
    if (i % 50 === 49) process.stdout.write(".");
  }
  console.log(` ${flatFelts.length} felts read`);

  // Reconstruct MaskedCard[]
  const p1Deck: Array<{ c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint }; r: bigint }> = [];
  for (let i = 0; i < 52; i++) {
    const b = i * 8;
    p1Deck.push({
      c1: { x: u256pair(flatFelts[b],     flatFelts[b + 1]), y: u256pair(flatFelts[b + 2], flatFelts[b + 3]) },
      c2: { x: u256pair(flatFelts[b + 4], flatFelts[b + 5]), y: u256pair(flatFelts[b + 6], flatFelts[b + 7]) },
      r: 0n,
    });
  }

  // ── 7. Rerandomize + shuffle ───────────────────────────────────────────────
  console.log("\n[7] Rerandomizing deck under APK...");
  const rerand = await rerandomizeDeck(p1Deck, apk);

  // Fisher-Yates shuffle
  const finalDeck = [...rerand];
  for (let i = finalDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [finalDeck[i], finalDeck[j]] = [finalDeck[j], finalDeck[i]];
  }
  console.log(`    Shuffled ${finalDeck.length} cards`);

  // ── 8. Submit P2 shuffle ──────────────────────────────────────────────────
  console.log("\n[8] Submitting P2 shuffle on-chain...");
  await client.submitShuffle(account as any, GAME_ID, deckToCalldata(finalDeck));
  console.log("    ✅ Shuffle submitted");

  // ── 9. Wait for Playing phase ─────────────────────────────────────────────
  await poll("Playing phase (phase ≥ 3)", async () => {
    const p = await client.getGamePhase(GAME_ID);
    return p >= 3 ? p : null;
  });

  // ── 10. P2 checks ─────────────────────────────────────────────────────────
  console.log("\n[10] P2 checks...");
  try {
    await client.checkAction(account as any, GAME_ID);
    console.log("     ✅ Checked");
  } catch (e: any) {
    if (e.message?.includes("ALREADY_CHECKED") || e.message?.includes("NOT_YOUR_TURN")) {
      console.log("     ⚠ Already checked or not P2 turn yet — continuing");
    } else throw e;
  }

  // ── 11. Wait for Showdown ─────────────────────────────────────────────────
  await poll("Showdown phase (phase = 4)", async () => {
    const p = await client.getGamePhase(GAME_ID);
    return p === 4 ? p : null;
  });

  // ── 12. Real card recovery ────────────────────────────────────────────────
  console.log("\n[12] Computing P2 partial decrypts for P1's slots (0-4)...");
  const pd2ForP1 = await Promise.all(
    P1_SLOTS.map(slot => partialDecrypt(finalDeck[slot].c1, kp2.secretKey))
  );
  console.log("     ✅ Computed");

  console.log("\n[13] Submitting P2 partial decrypts for P1's slots (batch)...");
  await client.submitPartialDecryptsBatch(account as any, GAME_ID, P1_SLOTS, pd2ForP1);
  console.log("     ✅ Submitted");

  // ── 13. Wait for P1 to submit their partial decrypts for P2's slots ───────
  const pd1ForP2 = await poll(
    "P1 partial decrypts for P2 slots (5-9)",
    async () => {
      const check = await client.getPartialDecrypt(GAME_ID, p1Addr, P2_SLOTS[0]);
      if (!check) return null;
      return Promise.all(P2_SLOTS.map(slot => client.getPartialDecrypt(GAME_ID, p1Addr, slot)));
    },
    3000,
  ) as Array<{ x: bigint; y: bigint }>;

  // ── 14. Recover P2's actual cards ────────────────────────────────────────
  console.log("\n[14] Recovering P2's actual cards...");
  const p2Hand: number[] = [];
  for (let i = 0; i < P2_SLOTS.length; i++) {
    const slot = P2_SLOTS[i];
    const pd2Own = await partialDecrypt(finalDeck[slot].c1, kp2.secretKey);
    const card = await recoverCard(
      { ...finalDeck[slot], r: 0n },
      [pd1ForP2[i]!, pd2Own],
    );
    p2Hand.push(card);
    console.log(`     slot ${slot} → card ${card}`);
  }
  console.log(`     P2 hand: [${p2Hand.join(", ")}]`);

  // ── 15. Reveal P2 hand ────────────────────────────────────────────────────
  console.log("\n[15] Revealing P2 hand on-chain...");
  await client.revealHand(account as any, GAME_ID, p2Hand as [number,number,number,number,number]);
  console.log("     ✅ P2 hand revealed!");

  // ── 16. Done ──────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════╗");
  console.log("║  P2 complete! Waiting for P1     ║");
  console.log("║  P1 must now reveal their hand.  ║");
  console.log("╚══════════════════════════════════╝");
  console.log("\n→ In Chrome, click 'Reveal Hand' to complete settlement.");

  const pot = await client.getPot(GAME_ID);
  console.log(`\nCurrent pot: ${Number(pot) / 1e18} STRK`);
}

main().catch(err => {
  console.error("\n❌ Fatal:", err.message ?? err);
  process.exit(1);
});
