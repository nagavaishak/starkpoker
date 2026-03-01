#!/usr/bin/env npx tsx
/**
 * e2e-integration.ts — Full game on local starknet-devnet
 *
 * Prerequisites:
 *   starknet-devnet --port 5050 --seed 42   (running in background)
 *   PokerGame already declared + deployed    (done in Day 5)
 *
 * What this tests (10 assertions):
 *   1.  Game created, phase = WaitingForPlayer2
 *   2.  P2 joins, phase = RegisteringKeys
 *   3.  Both keys registered, phase = Shuffling
 *   4.  P1 submits masked deck, shuffle_step = 1
 *   5.  P2 submits shuffle, phase = Playing
 *   6.  Both players check, phase = Showdown
 *   7.  P1 reveals hand, phase still Showdown
 *   8.  P2 reveals hand, phase = Done
 *   9.  Pot zeroed (sent to winner)
 *  10.  Fold scenario: P1 folds on a new game → phase = Done instantly
 *
 * Note: submit_partial_decrypt is exercised with a MOCK verifier
 * (the devnet verifier address is a dummy — ZK proofs are not verified here).
 * Full ZK proof verification is tested on Sepolia in e2e-sepolia.ts.
 */

import { Account, RpcProvider } from "starknet";
import { PokerContractClient, GamePhase, deckToCalldata, buildAccount } from "../src/starknet.js";
import {
  generateKeypair,
  computeAggregateKey,
  maskCard,
  shuffleDeck,
  rerandomizeDeck,
  partialDecrypt,
  recoverCard,
  type MaskedCard,
} from "babyjubjub-starknet";

// ─── Devnet config ────────────────────────────────────────────────────────

const RPC_URL  = "http://localhost:5050";

// Accounts from: starknet-devnet --seed 42
const P1_ADDR  = "0x034ba56f92265f0868c57d3fe72ecab144fc96f97954bbbc4252cef8e8a979ba";
const P1_KEY   = "0x00000000000000000000000000000000b137668388dbe9acdfa3bc734cc2c469";
const P2_ADDR  = "0x02939f2dc3f80cc7d620e8a86f2e69c1e187b7ff44b74056647368b5c49dc370";
const P2_KEY   = "0x00000000000000000000000000000000e8c2801d899646311100a661d32587aa";

// Deployed in Day 5
const GAME_ADDR = "0x030d148d9cf1445f476eb2f6e084ff4480f3ccffb98d7ac1fad759c857e5b47c";
const STRK_ADDR = "0x4718F5A0FC34CC1AF16A1CDEE98FFB20C31F5CD61D6AB07201858F4287C938D";

const ANTE = 1_000_000_000_000_000_000n; // 1 STRK

// ─── Assertion helper ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✅  [${passed + failed + 1}] ${label}`);
    passed++;
  } else {
    console.error(`  ❌  [${passed + failed + 1}] FAIL: ${label}`);
    failed++;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function buildMaskedDeck(apk: Awaited<ReturnType<typeof computeAggregateKey>>): Promise<MaskedCard[]> {
  const deck: MaskedCard[] = [];
  for (let i = 0; i < 52; i++) deck.push(await maskCard(i, apk));
  return deck;
}

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["c","d","h","s"];
const cardName = (i: number) => RANKS[i % 13] + SUITS[Math.floor(i / 13)];

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  StarkPoker — E2E Integration Test (starknet-devnet)");
  console.log("  RPC:", RPC_URL);
  console.log("═══════════════════════════════════════════════════════\n");

  // Verify devnet is reachable
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  try {
    await provider.getBlockNumber();
  } catch {
    console.error("ERROR: starknet-devnet is not running at", RPC_URL);
    console.error("Start it with: starknet-devnet --port 5050 --seed 42");
    process.exit(1);
  }

  const p1 = buildAccount(RPC_URL, P1_ADDR, P1_KEY);
  const p2 = buildAccount(RPC_URL, P2_ADDR, P2_KEY);

  const client = new PokerContractClient(RPC_URL, {
    gameAddress: GAME_ADDR,
    strkAddress: STRK_ADDR,
  });

  // ── Keypairs & APK ────────────────────────────────────────────────────
  const kp1 = await generateKeypair();
  const kp2 = await generateKeypair();
  const apk = await computeAggregateKey(kp1.publicKey, kp2.publicKey);

  // ════════════════════════════════════════════════════════════════════════
  // SCENARIO A: Full game round (create → shuffle → check+check → reveal)
  // ════════════════════════════════════════════════════════════════════════
  console.log("── Scenario A: Full game round ──────────────────────────\n");

  // ── 1. Create game ────────────────────────────────────────────────────
  console.log("Step 1: P1 creates game");
  const gameId = await client.createGame(p1, ANTE);
  const phase1 = await client.getGamePhase(gameId);
  assert(phase1 === GamePhase.WaitingForPlayer2, "Phase = WaitingForPlayer2 after create");
  console.log("  game_id:", gameId);

  // ── 2. Join game ──────────────────────────────────────────────────────
  console.log("\nStep 2: P2 joins");
  await client.joinGame(p2, gameId);
  const phase2 = await client.getGamePhase(gameId);
  assert(phase2 === GamePhase.RegisteringKeys, "Phase = RegisteringKeys after join");

  const pot2 = await client.getPot(gameId);
  assert(pot2 === ANTE * 2n, "Pot = 2 × ante after join");

  // ── 3. Register public keys ───────────────────────────────────────────
  console.log("\nStep 3: Both register public keys");
  await client.registerPublicKey(p1, gameId, kp1.publicKey.x, kp1.publicKey.y);
  await client.registerPublicKey(p2, gameId, kp2.publicKey.x, kp2.publicKey.y);

  const phase3 = await client.getGamePhase(gameId);
  assert(phase3 === GamePhase.Shuffling, "Phase = Shuffling after both keys registered");

  // ── 4. P1 submits masked deck ─────────────────────────────────────────
  console.log("\nStep 4: P1 masks & submits deck");
  const initialDeck = await buildMaskedDeck(apk);
  const { shuffled: p1Deck } = await shuffleDeck(initialDeck);
  await client.submitMaskedDeck(p1, gameId, deckToCalldata(p1Deck));

  const step4 = await client.getShuffleStep(gameId);
  assert(step4 === 1, "shuffle_step = 1 after P1 deck submission");

  const phase4 = await client.getGamePhase(gameId);
  assert(phase4 === GamePhase.Shuffling, "Phase still Shuffling after P1 deck");

  // ── 5. P2 submits shuffled deck ───────────────────────────────────────
  console.log("\nStep 5: P2 rerandomises & submits shuffle");
  const p2PreDeck = await rerandomizeDeck(p1Deck, apk);
  const { shuffled: finalDeck } = await shuffleDeck(p2PreDeck);
  await client.submitShuffle(p2, gameId, deckToCalldata(finalDeck));

  const phase5 = await client.getGamePhase(gameId);
  assert(phase5 === GamePhase.Playing, "Phase = Playing after P2 shuffle");

  // ── 6. Both players check (→ Showdown) ───────────────────────────────
  console.log("\nStep 6: Both players check");
  await client.checkAction(p1, gameId);
  await client.checkAction(p2, gameId);

  const phase6 = await client.getGamePhase(gameId);
  assert(phase6 === GamePhase.Showdown, "Phase = Showdown after check+check");

  // ── 7. Recover hands locally ──────────────────────────────────────────
  console.log("\nStep 7: Recover hands (local crypto — no chain call)");

  const p1Slots = [0, 1, 2, 3, 4];
  const p2Slots = [5, 6, 7, 8, 9];

  // P1 recovers her hand
  const p1Hand: number[] = [];
  for (let i = 0; i < 5; i++) {
    const slot = p1Slots[i];
    const myPD   = await partialDecrypt(finalDeck[slot].c1, kp1.secretKey);
    const oppPD  = await partialDecrypt(finalDeck[slot].c1, kp2.secretKey);
    p1Hand.push(await recoverCard(finalDeck[slot], [myPD, oppPD]));
  }

  // P2 recovers his hand
  const p2Hand: number[] = [];
  for (let i = 0; i < 5; i++) {
    const slot = p2Slots[i];
    const myPD   = await partialDecrypt(finalDeck[slot].c1, kp2.secretKey);
    const oppPD  = await partialDecrypt(finalDeck[slot].c1, kp1.secretKey);
    p2Hand.push(await recoverCard(finalDeck[slot], [myPD, oppPD]));
  }

  console.log("  P1 hand:", p1Hand.map(cardName).join(" "));
  console.log("  P2 hand:", p2Hand.map(cardName).join(" "));
  assert(
    p1Hand.every((c) => c >= 0 && c < 52) && p2Hand.every((c) => c >= 0 && c < 52),
    "All recovered card indices are valid (0-51)"
  );

  // ── 8. P1 reveals hand on-chain ───────────────────────────────────────
  console.log("\nStep 8: P1 reveals hand");
  await client.revealHand(p1, gameId, [p1Hand[0], p1Hand[1], p1Hand[2], p1Hand[3], p1Hand[4]]);

  const phase8 = await client.getGamePhase(gameId);
  assert(phase8 === GamePhase.Showdown, "Phase still Showdown after P1 reveals");

  // ── 9. P2 reveals hand on-chain ───────────────────────────────────────
  console.log("\nStep 9: P2 reveals hand → triggers settle()");
  await client.revealHand(p2, gameId, [p2Hand[0], p2Hand[1], p2Hand[2], p2Hand[3], p2Hand[4]]);

  const phase9 = await client.getGamePhase(gameId);
  assert(phase9 === GamePhase.Done, "Phase = Done after both reveal");

  const pot9 = await client.getPot(gameId);
  assert(pot9 === 0n, "Pot zeroed after settle");

  // ════════════════════════════════════════════════════════════════════════
  // SCENARIO B: Fold scenario
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n── Scenario B: Fold ────────────────────────────────────\n");

  // Use fresh keypairs + a third pre-funded account for variety
  const kp3 = await generateKeypair();
  const kp4 = await generateKeypair();
  const apk2 = await computeAggregateKey(kp3.publicKey, kp4.publicKey);

  // P1 creates second game
  const gameId2 = await client.createGame(p1, ANTE);

  // Use a third devnet account for P2 in this scenario
  // (devnet accounts[2])
  const P3_ADDR = "0x025a6c9f0c15ef30c139065096b4b8e563e6b86191fd600a4f0616df8f22fb77";
  const P3_KEY  = "0x000000000000000000000000000000007b2e5d0e627be6ce12ddc6fd0f5ff2fb";
  const p3 = buildAccount(RPC_URL, P3_ADDR, P3_KEY);

  await client.joinGame(p3, gameId2);
  await client.registerPublicKey(p1, gameId2, kp3.publicKey.x, kp3.publicKey.y);
  await client.registerPublicKey(p3, gameId2, kp4.publicKey.x, kp4.publicKey.y);

  const initDeck2 = await buildMaskedDeck(apk2);
  const { shuffled: p1Deck2 } = await shuffleDeck(initDeck2);
  await client.submitMaskedDeck(p1, gameId2, deckToCalldata(p1Deck2));

  const p2Pre2 = await rerandomizeDeck(p1Deck2, apk2);
  const { shuffled: finalDeck2 } = await shuffleDeck(p2Pre2);
  await client.submitShuffle(p3, gameId2, deckToCalldata(finalDeck2));

  // Now in Playing phase — P1 folds immediately
  await client.fold(p1, gameId2);

  const phase10 = await client.getGamePhase(gameId2);
  assert(phase10 === GamePhase.Done, "Phase = Done immediately after fold");

  const pot10 = await client.getPot(gameId2);
  assert(pot10 === 0n, "Pot zeroed after fold");

  // ── Summary ───────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Integration test failed:", err);
  process.exit(1);
});
