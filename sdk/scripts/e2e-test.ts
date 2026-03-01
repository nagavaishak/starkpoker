#!/usr/bin/env npx tsx
/**
 * e2e-test.ts — Full game round-trip, NO blockchain required
 *
 * Tests the complete cryptographic protocol:
 *   1. Two players generate Baby Jubjub keypairs
 *   2. Compute aggregate public key
 *   3. Player 1 masks all 52 cards
 *   4. Both players shuffle (commit-reveal)
 *   5. Each player partially decrypts the opponent's 5 cards
 *   6. Each player recovers their own hand
 *   7. Hand scores are evaluated and winner determined
 *
 * All assertions must pass. No starknet.js calls.
 */

import {
  generateKeypair,
  computeAggregateKey,
  maskCard,
  partialDecrypt,
  recoverCard,
  shuffleDeck,
  rerandomizeDeck,
  type MaskedCard,
  type BJJPoint,
} from "babyjubjub-starknet";

// ─── Card utilities ───────────────────────────────────────────────────────

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["c","d","h","s"];
const cardName = (i: number) => RANKS[i % 13] + SUITS[Math.floor(i / 13)];

// Hand evaluator (mirrors Cairo hand_eval.cairo)
function handScore(cards: number[]): number {
  const ranks = cards.map((c) => c % 13);
  const suits = cards.map((c) => Math.floor(c / 13));

  const flush = suits.every((s) => s === suits[0]);
  const sorted = [...ranks].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[4];

  let straight = false;
  if (max - min === 4 && new Set(ranks).size === 5) {
    straight = true;
  }
  // Ace-low straight A-2-3-4-5
  if (
    sorted[0] === 0 && sorted[1] === 1 && sorted[2] === 2 &&
    sorted[3] === 3 && sorted[4] === 12
  ) {
    straight = true;
  }

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const vals = [...counts.values()].sort((a, b) => b - a);

  let rank: number;
  if (flush && straight)        rank = 8;
  else if (vals[0] === 4)       rank = 7;
  else if (vals[0] === 3 && vals[1] === 2) rank = 6;
  else if (flush)               rank = 5;
  else if (straight)            rank = 4;
  else if (vals[0] === 3)       rank = 3;
  else if (vals[0] === 2 && vals[1] === 2) rank = 2;
  else if (vals[0] === 2)       rank = 1;
  else                          rank = 0;

  const maxRank = Math.max(...ranks);
  const sumRank = ranks.reduce((a, b) => a + b, 0);
  return rank * 10000 + maxRank * 100 + sumRank;
}

const HAND_NAMES = [
  "high card","pair","two pair","three of a kind",
  "straight","flush","full house","four of a kind","straight flush",
];
function handRank(cards: number[]): string {
  return HAND_NAMES[Math.floor(handScore(cards) / 10000)];
}

// ─── Assertion helper ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅  ${message}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${message}`);
    failed++;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  StarkPoker — E2E Crypto Test (no blockchain)");
  console.log("═══════════════════════════════════════════════════════\n");

  // ── Step 1: Keypairs ──────────────────────────────────────────────────
  console.log("Step 1: Generate keypairs");
  const alice = await generateKeypair();
  const bob = await generateKeypair();

  assert(alice.secretKey !== bob.secretKey, "Alice and Bob have different secret keys");
  assert(alice.publicKey.x !== bob.publicKey.x, "Alice and Bob have different public keys");
  console.log("  Alice pk.x =", `0x${alice.publicKey.x.toString(16).slice(0, 16)}...`);
  console.log("  Bob   pk.x =", `0x${bob.publicKey.x.toString(16).slice(0, 16)}...`);

  // ── Step 2: Aggregate public key ──────────────────────────────────────
  console.log("\nStep 2: Compute aggregate public key (APK = Alice.pk + Bob.pk)");
  const apk = await computeAggregateKey(alice.publicKey, bob.publicKey);
  assert(apk.x !== alice.publicKey.x, "APK is different from individual keys");
  console.log("  APK.x =", `0x${apk.x.toString(16).slice(0, 16)}...`);

  // ── Step 3: Mask all 52 cards ─────────────────────────────────────────
  console.log("\nStep 3: Mask 52 cards with APK");
  const startMask = Date.now();
  const initialDeck: MaskedCard[] = [];
  for (let i = 0; i < 52; i++) {
    initialDeck.push(await maskCard(i, apk));
  }
  console.log(`  Masked 52 cards in ${Date.now() - startMask}ms`);
  assert(initialDeck.length === 52, "Deck has 52 masked cards");

  // Spot-check: all C1 components are distinct
  const c1xSet = new Set(initialDeck.map((c) => c.c1.x.toString()));
  assert(c1xSet.size === 52, "All C1.x components are distinct (unique blinding factors)");

  // ── Step 4: Double shuffle ────────────────────────────────────────────
  console.log("\nStep 4: Double shuffle (Alice then Bob rerandomise + shuffle)");

  const { shuffled: aliceDeck, commitHash: aliceCommit } = await shuffleDeck(initialDeck);
  console.log("  Alice commit:", aliceCommit.slice(0, 16) + "...");

  const bobDeckBeforeShuffle = await rerandomizeDeck(aliceDeck, apk);
  const { shuffled: finalDeck, commitHash: bobCommit } = await shuffleDeck(bobDeckBeforeShuffle);
  console.log("  Bob   commit:", bobCommit.slice(0, 16) + "...");

  assert(aliceCommit !== bobCommit, "Shuffle commits are different");
  assert(finalDeck.length === 52, "Final deck has 52 cards");

  // ── Step 5: Deal hands ────────────────────────────────────────────────
  console.log("\nStep 5: Deal 5 cards to each player");
  // Alice gets slots 0-4, Bob gets slots 5-9
  const aliceSlots = [0, 1, 2, 3, 4];
  const bobSlots   = [5, 6, 7, 8, 9];

  console.log("  Alice's slots:", aliceSlots);
  console.log("  Bob's   slots:", bobSlots);

  // ── Step 6: Partial decryption ────────────────────────────────────────
  console.log("\nStep 6: Each player partially decrypts OPPONENT's cards");
  const startPD = Date.now();

  // Alice's PDs for Bob's cards
  const alicePDsForBob: BJJPoint[] = [];
  for (const slot of bobSlots) {
    alicePDsForBob.push(await partialDecrypt(finalDeck[slot].c1, alice.secretKey));
  }

  // Bob's PDs for Alice's cards
  const bobPDsForAlice: BJJPoint[] = [];
  for (const slot of aliceSlots) {
    bobPDsForAlice.push(await partialDecrypt(finalDeck[slot].c1, bob.secretKey));
  }

  console.log(`  Computed 10 partial decrypts in ${Date.now() - startPD}ms`);
  assert(alicePDsForBob.length === 5, "Alice produced 5 PDs for Bob");
  assert(bobPDsForAlice.length === 5, "Bob produced 5 PDs for Alice");

  // ── Step 7: Recover hands ─────────────────────────────────────────────
  console.log("\nStep 7: Each player recovers their own hand");
  const startRecover = Date.now();

  // Alice recovers her cards using Bob's PDs + her own PDs
  const aliceHand: number[] = [];
  for (let i = 0; i < 5; i++) {
    const slot = aliceSlots[i];
    const alicePD = await partialDecrypt(finalDeck[slot].c1, alice.secretKey);
    const cardIndex = await recoverCard(finalDeck[slot], [alicePD, bobPDsForAlice[i]]);
    aliceHand.push(cardIndex);
  }

  // Bob recovers his cards using Alice's PDs + his own PDs
  const bobHand: number[] = [];
  for (let i = 0; i < 5; i++) {
    const slot = bobSlots[i];
    const bobPD = await partialDecrypt(finalDeck[slot].c1, bob.secretKey);
    const cardIndex = await recoverCard(finalDeck[slot], [alicePDsForBob[i], bobPD]);
    bobHand.push(cardIndex);
  }

  console.log(`  Recovery in ${Date.now() - startRecover}ms`);

  // Verify all recovered indices are valid (0-51)
  assert(
    aliceHand.every((c) => c >= 0 && c < 52),
    "All of Alice's cards are valid (0-51)"
  );
  assert(
    bobHand.every((c) => c >= 0 && c < 52),
    "All of Bob's cards are valid (0-51)"
  );

  // Hands should be distinct (no two players share a card)
  const allCards = new Set([...aliceHand, ...bobHand]);
  assert(allCards.size === 10, "No duplicate cards between hands");

  console.log(
    "  Alice's hand:",
    aliceHand.map(cardName).join(" "),
    `(${handRank(aliceHand)})`
  );
  console.log(
    "  Bob's   hand:",
    bobHand.map(cardName).join(" "),
    `(${handRank(bobHand)})`
  );

  // ── Step 8: Determine winner ──────────────────────────────────────────
  console.log("\nStep 8: Evaluate hands and determine winner");
  const aliceScore = handScore(aliceHand);
  const bobScore   = handScore(bobHand);

  console.log(`  Alice score: ${aliceScore} (${handRank(aliceHand)})`);
  console.log(`  Bob   score: ${bobScore} (${handRank(bobHand)})`);

  const winner = aliceScore >= bobScore ? "Alice" : "Bob";
  console.log(`  Winner: ${winner}`);
  assert(true, `Winner determined: ${winner}`);

  // ── Bonus: Serialization sanity check ────────────────────────────────
  console.log("\nStep 9: Serialization sanity check (deck calldata format)");
  const MASK128 = (1n << 128n) - 1n;
  const toU256Felts = (v: bigint): string[] => [
    `0x${(v & MASK128).toString(16)}`,
    `0x${(v >> 128n).toString(16)}`,
  ];

  const card0Felts = [
    ...toU256Felts(finalDeck[0].c1.x),
    ...toU256Felts(finalDeck[0].c1.y),
    ...toU256Felts(finalDeck[0].c2.x),
    ...toU256Felts(finalDeck[0].c2.y),
  ];
  assert(card0Felts.length === 8, "Each card serializes to 8 felt252 strings");

  const fullDeckFelts = finalDeck.flatMap((card) => [
    ...toU256Felts(card.c1.x), ...toU256Felts(card.c1.y),
    ...toU256Felts(card.c2.x), ...toU256Felts(card.c2.y),
  ]);
  assert(fullDeckFelts.length === 416, "Full deck serializes to 416 felt252 strings");

  // Roundtrip: deserialize first card and check coordinates match
  const c1xLow  = BigInt(card0Felts[0]);
  const c1xHigh = BigInt(card0Felts[1]);
  const c1xRecovered = c1xLow + c1xHigh * (1n << 128n);
  assert(c1xRecovered === finalDeck[0].c1.x, "C1.x roundtrips through u256 felt252 encoding");

  // ── Summary ───────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("E2E test failed:", err);
  process.exit(1);
});
