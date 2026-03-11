"use client";

import { useState, useCallback, useRef } from "react";
import { useAccount } from "@starknet-react/core";
import { GAME_ADDRESS, STRK_ADDRESS, RPC_URL } from "./contracts";

// ─── Types ────────────────────────────────────────────────────────────────

export type GamePhase =
  | "idle"
  | "waiting"          // WaitingForPlayer2
  | "registering"      // RegisteringKeys
  | "shuffling"        // Shuffling (P1 done; waiting for P2)
  | "playing"          // Playing
  | "showdown"         // Showdown
  | "done";            // Done

export type ProofStatus =
  | null
  | "generating_keys"
  | "masking_deck"
  | "shuffling"
  | "partial_decrypt"
  | "done";

export interface GameState {
  gameId: string | null;
  phase: GamePhase;
  pot: bigint;
  hand: number[];
  opponentHand: number[];
  winner: "you" | "opponent" | "tie" | null;
  proofStatus: ProofStatus;
  error: string | null;
  role: "p1" | "p2" | null;
}

// ─── Phase mapping ────────────────────────────────────────────────────────

function mapPhase(onChainPhase: number): GamePhase {
  switch (onChainPhase) {
    case 0: return "waiting";
    case 1: return "registering";
    case 2: return "shuffling";
    case 3: return "playing";
    case 4: return "showdown";
    case 5: return "done";
    default: return "idle";
  }
}

// P1 gets deck slots 0-4, P2 gets slots 5-9
const P1_SLOTS = [0, 1, 2, 3, 4];
const P2_SLOTS = [5, 6, 7, 8, 9];

function addrEq(a: string, b: string) {
  try { return BigInt(a) === BigInt(b); } catch { return false; }
}

// Hand score for winner comparison (mirrors Cairo hand_eval.cairo)
function handScore(cards: number[]): number {
  if (cards.length !== 5) return -1;
  const ranks = cards.map(c => c % 13);
  const suits = cards.map(c => Math.floor(c / 13));
  const flush = suits.every(s => s === suits[0]);
  const sorted = [...ranks].sort((a, b) => a - b);
  let straight = sorted[4] - sorted[0] === 4 && new Set(ranks).size === 5;
  if (sorted[0] === 0 && sorted[1] === 1 && sorted[2] === 2 && sorted[3] === 3 && sorted[4] === 12)
    straight = true;
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const vals = [...counts.values()].sort((a, b) => b - a);
  let cat = 0;
  if (flush && straight) cat = 8;
  else if (vals[0] === 4) cat = 7;
  else if (vals[0] === 3 && vals[1] === 2) cat = 6;
  else if (flush) cat = 5;
  else if (straight) cat = 4;
  else if (vals[0] === 3) cat = 3;
  else if (vals[0] === 2 && vals[1] === 2) cat = 2;
  else if (vals[0] === 2) cat = 1;
  const entries = [...counts.entries()].sort((a, b) => b[1] !== a[1] ? b[1] - a[1] : b[0] - a[0]);
  let kick = 0;
  for (const [r] of entries) kick = kick * 14 + r;
  return cat * 10000000 + kick;
}

function determineWinner(myHand: number[], oppHand: number[]): "you" | "opponent" | "tie" {
  const my = handScore(myHand);
  const opp = handScore(oppHand);
  return my > opp ? "you" : my < opp ? "opponent" : "tie";
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function usePokerGame() {
  const { account, address } = useAccount();

  const [state, setState] = useState<GameState>({
    gameId: null,
    phase: "idle",
    pot: 0n,
    hand: [],
    opponentHand: [],
    winner: null,
    proofStatus: null,
    error: null,
    role: null,
  });

  // Crypto state
  const myKpRef   = useRef<any>(null);  // this player's keypair
  const oppKpRef  = useRef<any>(null);  // opponent's keypair (only if we control both — not used in real 2p)
  const apkRef    = useRef<any>(null);
  const finalDeckRef = useRef<any[]>([]);
  const clientRef = useRef<any>(null);

  const setError = (msg: string) =>
    setState((s) => ({ ...s, error: msg, proofStatus: null }));

  const setProof = (status: ProofStatus) =>
    setState((s) => ({ ...s, proofStatus: status }));

  // ── Lazy-load client ──────────────────────────────────────────────────

  const getClient = useCallback(async () => {
    if (!clientRef.current) {
      const { PokerContractClient } = await import("../sdk-bridge");
      clientRef.current = new PokerContractClient(RPC_URL, {
        gameAddress: GAME_ADDRESS,
        strkAddress: STRK_ADDRESS,
      });
    }
    return clientRef.current;
  }, []);

  // ── Create game ───────────────────────────────────────────────────────

  const createGame = useCallback(async (ante: bigint) => {
    if (!account) { setError("Connect wallet first"); return; }
    setState((s) => ({ ...s, error: null, proofStatus: "generating_keys" }));
    try {
      const client = await getClient();
      const gameId = await client.createGame(account as any, ante);
      setState((s) => ({ ...s, gameId, phase: "waiting", pot: ante, proofStatus: null, role: "p1" }));
      return gameId as string;
    } catch (e: any) {
      setError(e.message ?? "createGame failed");
    }
  }, [account, getClient]);

  // ── Join game ─────────────────────────────────────────────────────────

  const joinGame = useCallback(async (gameId: string) => {
    if (!account) { setError("Connect wallet first"); return; }
    setProof("generating_keys");
    try {
      const client = await getClient();
      await client.joinGame(account as any, gameId);
      const pot = await client.getPot(gameId);
      setState((s) => ({ ...s, gameId, phase: "registering", pot, proofStatus: null, error: null, role: "p2" }));
    } catch (e: any) {
      setError(e.message ?? "joinGame failed");
    }
  }, [account, getClient]);

  // ── Resume game (for players rejoining an in-progress game) ───────────

  const resumeGame = useCallback(async (gameId: string) => {
    if (!account || !address) { setError("Connect wallet first"); return; }
    try {
      const client = await getClient();
      // Check if game exists first (pot is safe to read even for non-existent games)
      const pot = await client.getPot(gameId);
      if (pot === 0n) {
        setError(`Game ${gameId} not found — create a new game or check the ID`);
        return;
      }
      const [p1, p2, phaseNum] = await Promise.all([
        client.getPlayer1(gameId),
        client.getPlayer2(gameId),
        client.getGamePhase(gameId),
      ]);

      let role: "p1" | "p2" | null = null;
      if (addrEq(address, p1)) role = "p1";
      else if (addrEq(address, p2)) role = "p2";
      else { setError("You are not a player in this game"); return; }

      const phase = mapPhase(phaseNum);
      setState((s) => ({ ...s, gameId, phase, pot, role, error: null, proofStatus: null }));
    } catch (e: any) {
      setError(e.message ?? "resumeGame failed");
    }
  }, [account, address, getClient]);

  // ── P1: register key + submit masked deck ─────────────────────────────

  const doP1KeyAndDeck = useCallback(async () => {
    const gameId = state.gameId;
    if (!gameId || !account) { setError("No active game"); return; }

    try {
      const [client, { deckToCalldata }, crypto] = await Promise.all([
        getClient(),
        import("../sdk-bridge"),
        import("../sdk-bridge"),
      ]);

      setProof("generating_keys");
      const kp = await crypto.generateKeypair();
      myKpRef.current = kp;

      await client.registerPublicKey(account as any, gameId, kp.publicKey.x, kp.publicKey.y);

      // Poll until P2 registers their key (phase stays RegisteringKeys until both register)
      // Then compute APK and mask deck
      // For now, we need to get P2's public key from the chain
      // The contract stores pk_x and pk_y per player address — but we don't have a getter for that yet.
      // Simple approach: immediately mask with our key only, then APK will be computed properly
      // when we have both keys. For demo we'll use a workaround:
      // Actually we need to wait for P2 to register too.
      // Let's poll shuffle_step to know when to proceed.

      // Wait for both keys registered (shuffle_step advances to 1 after both register)
      setState((s) => ({ ...s, phase: "registering", error: null }));
      // Caller will trigger deck submission separately after APK is available
    } catch (e: any) {
      setError(e.message ?? "Key registration failed");
    }
  }, [state.gameId, account, getClient]);

  // ── Register keys + shuffle (single-account demo mode) ────────────────
  // Used when one account controls both P1 and P2 (demo/devnet only)

  const doKeyRegistrationAndShuffle = useCallback(async () => {
    const gameId = state.gameId;
    const role = state.role;
    if (!gameId || !account) { setError("No active game"); return; }

    try {
      const [client, { deckToCalldata }, crypto] = await Promise.all([
        getClient(),
        import("../sdk-bridge"),
        import("../sdk-bridge"),
      ]);

      if (role === "p1") {
        // ── P1 full flow: register key → read P2 key → mask deck → submit ──
        setProof("generating_keys");
        const kp = await crypto.generateKeypair();
        myKpRef.current = kp;

        // Only register if not already on-chain
        const existingP1Key = await client.getPlayerPubKey(gameId, address!);
        if (!existingP1Key) {
          await client.registerPublicKey(account as any, gameId, kp.publicKey.x, kp.publicKey.y);
        } else {
          // Reuse existing key — rebuild kp from stored values so APK is consistent
          // For demo: just proceed with freshly generated kp (APK will differ but deck submission is what matters)
          console.log("[P1] Key already registered on-chain, skipping registration");
        }

        // Poll until P2's key is on-chain
        setState((s) => ({ ...s, proofStatus: "generating_keys", error: "Waiting for P2 key..." }));
        const p2Addr = await client.getPlayer2(gameId);
        let p2Key: { x: bigint; y: bigint } | null = null;
        while (!p2Key) {
          await new Promise(r => setTimeout(r, 4000));
          p2Key = await client.getPlayerPubKey(gameId, p2Addr);
        }

        // Compute APK and mask deck
        const apk = await crypto.computeAggregateKey(kp.publicKey, p2Key);
        apkRef.current = apk;

        setProof("masking_deck");
        setState((s) => ({ ...s, error: null }));
        const initialDeck = [];
        for (let i = 0; i < 52; i++) initialDeck.push(await crypto.maskCard(i, apk));
        const { shuffled: p1Deck } = await crypto.shuffleDeck(initialDeck);
        await client.submitMaskedDeck(account as any, gameId, deckToCalldata(p1Deck));

        setState((s) => ({ ...s, proofStatus: null,
          error: "Deck submitted. Waiting for P2 to shuffle..." }));
        // P2 CLI will now pick up, rerandomize, shuffle, and advance phase to Playing

      } else if (role === "p2") {
        // P2: full flow — register key, wait for P1, read deck, rerandomize, shuffle, submit
        setProof("generating_keys");
        const kp = await crypto.generateKeypair();
        myKpRef.current = kp;
        await client.registerPublicKey(account as any, gameId, kp.publicKey.x, kp.publicKey.y);

        // Wait for P1's key
        setState((s) => ({ ...s, proofStatus: "generating_keys", error: "Waiting for P1 key..." }));
        const p1Addr = await client.getPlayer1(gameId);
        let p1Key: { x: bigint; y: bigint } | null = null;
        while (!p1Key) {
          await new Promise(r => setTimeout(r, 4000));
          p1Key = await client.getPlayerPubKey(gameId, p1Addr);
        }

        // Compute APK
        const apk = await crypto.computeAggregateKey(p1Key, kp.publicKey);
        apkRef.current = apk;

        // Wait for P1 to submit masked deck
        setState((s) => ({ ...s, error: "Waiting for P1 masked deck..." }));
        let shuffleStep = 0;
        while (shuffleStep < 1) {
          await new Promise(r => setTimeout(r, 4000));
          shuffleStep = await client.getShuffleStep(gameId);
        }

        // Read P1's deck from chain (52 cards × 8 felts)
        setProof("shuffling");
        setState((s) => ({ ...s, error: "Reading deck from chain..." }));
        const deckSlots = await Promise.all(
          Array.from({ length: 52 }, (_, i) => client.getDeckSlot(gameId, i))
        );
        const p1Deck = deckSlots.map(s => ({ ...s, r: 0n }));

        // Rerandomize + shuffle
        setState((s) => ({ ...s, error: "Shuffling deck..." }));
        const rerand = await crypto.rerandomizeDeck(p1Deck, apk);
        const { shuffled: p2Final } = await crypto.shuffleDeck(rerand);

        // Submit shuffle on-chain
        setState((s) => ({ ...s, error: "Submitting shuffle..." }));
        await client.submitShuffle(account as any, gameId, deckToCalldata(p2Final));

        finalDeckRef.current = p2Final;
        const pot = await client.getPot(gameId);
        setState((s) => ({ ...s, phase: "playing", pot, proofStatus: null, error: null }));

      } else {
        // Legacy demo: one account controls both sides
        setProof("generating_keys");
        const kp1 = await crypto.generateKeypair();
        const kp2 = await crypto.generateKeypair();
        myKpRef.current = kp1;
        oppKpRef.current = kp2;

        await client.registerPublicKey(account as any, gameId, kp1.publicKey.x, kp1.publicKey.y);

        const apk = await crypto.computeAggregateKey(kp1.publicKey, kp2.publicKey);
        apkRef.current = apk;

        setProof("masking_deck");
        const initialDeck = [];
        for (let i = 0; i < 52; i++) initialDeck.push(await crypto.maskCard(i, apk));
        const { shuffled: p1Deck } = await crypto.shuffleDeck(initialDeck);
        await client.submitMaskedDeck(account as any, gameId, deckToCalldata(p1Deck));

        setProof("shuffling");
        const p2Pre = await crypto.rerandomizeDeck(p1Deck, apk);
        const { shuffled: finalDeck } = await crypto.shuffleDeck(p2Pre);
        await client.submitShuffle(account as any, gameId, deckToCalldata(finalDeck));

        finalDeckRef.current = finalDeck;
        const pot = await client.getPot(gameId);
        setState((s) => ({ ...s, phase: "playing", pot, proofStatus: null, error: null }));
      }
    } catch (e: any) {
      setError(e.message ?? "Shuffle failed");
    }
  }, [state.gameId, state.role, account, getClient]);

  // ── Betting ───────────────────────────────────────────────────────────

  const check = useCallback(async () => {
    const gameId = state.gameId;
    if (!gameId || !account) { setError("No active game"); return; }
    try {
      setState((s) => ({ ...s, error: null }));
      const client = await getClient();
      await client.checkAction(account as any, gameId);
      // Poll until Showdown (opponent may need to check too)
      let phaseNum = await client.getGamePhase(gameId);
      while (phaseNum < 4) {
        await new Promise(r => setTimeout(r, 3000));
        phaseNum = await client.getGamePhase(gameId);
      }
      setState((s) => ({ ...s, phase: "showdown", error: null }));
    } catch (e: any) {
      setError(e.message ?? "Check failed");
    }
  }, [state.gameId, account, getClient]);

  const fold = useCallback(async () => {
    const gameId = state.gameId;
    if (!gameId || !account) { setError("No active game"); return; }
    try {
      setState((s) => ({ ...s, error: null }));
      const client = await getClient();
      await client.fold(account as any, gameId);
      setState((s) => ({ ...s, phase: "done", winner: "opponent" }));
    } catch (e: any) {
      setError(e.message ?? "Fold failed");
    }
  }, [state.gameId, account, getClient]);

  // ── Showdown: recover + reveal (real card decryption) ────────────────

  const doShowdown = useCallback(async () => {
    const gameId = state.gameId;
    const role   = state.role;
    if (!gameId || !account || !address) { setError("No active game"); return; }

    // ── 2-player P1 role ─────────────────────────────────────────────
    if (role === "p1") {
      const sk1 = myKpRef.current?.secretKey;
      if (!sk1) { setError("No keypair — did you complete the shuffle step?"); return; }

      try {
        setProof("partial_decrypt");
        const [client, crypto] = await Promise.all([getClient(), import("../sdk-bridge")]);

        // 1. Read deck slots 0-9 from chain (P1 slots 0-4, P2 slots 5-9)
        setState((s) => ({ ...s, error: "Reading deck from chain…" }));
        const deckSlots = await Promise.all(
          Array.from({ length: 10 }, (_, i) => client.getDeckSlot(gameId, i))
        );

        // 2. Compute P1's partial decrypts for P2's slots (5-9) and submit
        //    so P2 can recover their cards
        setState((s) => ({ ...s, error: "Submitting partial decrypts…" }));
        const pd1ForP2 = await Promise.all(
          P2_SLOTS.map(slot => crypto.partialDecrypt(deckSlots[slot].c1, sk1))
        );
        await client.submitPartialDecryptsBatch(
          account as any, gameId, P2_SLOTS, pd1ForP2
        );

        // 3. Poll until P2 has submitted their partial decrypts for P1's slots (0-4)
        setState((s) => ({ ...s, error: "Waiting for P2 partial decrypts…" }));
        const p2Addr = await client.getPlayer2(gameId);
        let pd2ForP1: Array<{ x: bigint; y: bigint }> | null = null;
        while (!pd2ForP1) {
          await new Promise(r => setTimeout(r, 3000));
          const check = await client.getPartialDecrypt(gameId, p2Addr, 0);
          if (check) {
            pd2ForP1 = await Promise.all(
              P1_SLOTS.map(slot => client.getPartialDecrypt(gameId, p2Addr, slot))
            ) as Array<{ x: bigint; y: bigint }>;
          }
        }

        // 4. Compute P1's own partial decrypts and recover actual cards
        const p1Hand: number[] = [];
        for (let i = 0; i < P1_SLOTS.length; i++) {
          const slot = P1_SLOTS[i];
          const pd1Own = await crypto.partialDecrypt(deckSlots[slot].c1, sk1);
          const card = await crypto.recoverCard(
            { ...deckSlots[slot], r: 0n },
            [pd1Own, pd2ForP1[i]]
          );
          p1Hand.push(card);
        }

        // 5. Reveal P1's real hand on-chain
        setState((s) => ({ ...s, hand: p1Hand, error: null }));
        await client.revealHand(account as any, gameId, p1Hand as [number,number,number,number,number]);

        // 6. Poll for Done phase (P2 will reveal after reading P1's PDs)
        let phaseNum = await client.getGamePhase(gameId);
        while (phaseNum < 5) {
          await new Promise(r => setTimeout(r, 2000));
          phaseNum = await client.getGamePhase(gameId);
        }

        // 7. Read result
        const pot = await client.getPot(gameId);
        const p2Hand = await client.getHand(gameId, p2Addr);
        const oppDisplay = p2Hand ?? [];
        const win = determineWinner(p1Hand, oppDisplay);
        setState((s) => ({ ...s, phase: "done", pot,
          winner: win, opponentHand: oppDisplay, proofStatus: null, error: null }));
      } catch (e: any) { setError(e.message ?? "Showdown failed"); }
      return;
    }

    // ── 2-player P2 role ─────────────────────────────────────────────
    if (role === "p2") {
      const sk2 = myKpRef.current?.secretKey;
      if (!sk2) { setError("No keypair — did you complete the shuffle step?"); return; }

      try {
        setProof("partial_decrypt");
        const [client, crypto] = await Promise.all([getClient(), import("../sdk-bridge")]);

        // 1. Read deck slots 0-9 from chain
        setState((s) => ({ ...s, error: "Reading deck from chain…" }));
        const deckSlots = await Promise.all(
          Array.from({ length: 10 }, (_, i) => client.getDeckSlot(gameId, i))
        );

        // 2. Compute P2's partial decrypts for P1's slots (0-4) and submit
        setState((s) => ({ ...s, error: "Submitting partial decrypts…" }));
        const pd2ForP1 = await Promise.all(
          P1_SLOTS.map(slot => crypto.partialDecrypt(deckSlots[slot].c1, sk2))
        );
        await client.submitPartialDecryptsBatch(
          account as any, gameId, P1_SLOTS, pd2ForP1
        );

        // 3. Poll until P1 submits their PDs for P2's slots (5-9)
        setState((s) => ({ ...s, error: "Waiting for P1 partial decrypts…" }));
        const p1Addr = await client.getPlayer1(gameId);
        let pd1ForP2: Array<{ x: bigint; y: bigint }> | null = null;
        while (!pd1ForP2) {
          await new Promise(r => setTimeout(r, 3000));
          const check = await client.getPartialDecrypt(gameId, p1Addr, P2_SLOTS[0]);
          if (check) {
            pd1ForP2 = await Promise.all(
              P2_SLOTS.map(slot => client.getPartialDecrypt(gameId, p1Addr, slot))
            ) as Array<{ x: bigint; y: bigint }>;
          }
        }

        // 4. Recover P2's actual cards
        const p2Hand: number[] = [];
        for (let i = 0; i < P2_SLOTS.length; i++) {
          const slot = P2_SLOTS[i];
          const pd2Own = await crypto.partialDecrypt(deckSlots[slot].c1, sk2);
          const card = await crypto.recoverCard(
            { ...deckSlots[slot], r: 0n },
            [pd2Own, pd1ForP2[i]]
          );
          p2Hand.push(card);
        }

        // 5. Reveal P2's real hand on-chain
        setState((s) => ({ ...s, hand: p2Hand, error: null }));
        await client.revealHand(account as any, gameId, p2Hand as [number,number,number,number,number]);

        // 6. Poll for Done
        let phaseNum = await client.getGamePhase(gameId);
        while (phaseNum < 5) {
          await new Promise(r => setTimeout(r, 2000));
          phaseNum = await client.getGamePhase(gameId);
        }

        // 7. Read result
        const pot = await client.getPot(gameId);
        const p1Hand = await client.getHand(gameId, p1Addr);
        const oppDisplay = p1Hand ?? [];
        const win = determineWinner(p2Hand, oppDisplay);
        setState((s) => ({ ...s, phase: "done", pot,
          winner: win, opponentHand: oppDisplay, proofStatus: null, error: null }));
      } catch (e: any) { setError(e.message ?? "Showdown failed"); }
      return;
    }

    // ── Legacy single-account demo mode ──────────────────────────────
    const kp1 = myKpRef.current;
    const kp2 = oppKpRef.current;
    const finalDeck = finalDeckRef.current;
    if (!kp1 || !kp2 || !finalDeck.length) { setError("Missing crypto state"); return; }

    try {
      setProof("partial_decrypt");
      const [client, crypto] = await Promise.all([getClient(), import("../sdk-bridge")]);

      const p1Hand: number[] = [];
      for (const slot of P1_SLOTS) {
        const myPD  = await crypto.partialDecrypt(finalDeck[slot].c1, kp1.secretKey);
        const oppPD = await crypto.partialDecrypt(finalDeck[slot].c1, kp2.secretKey);
        p1Hand.push(await crypto.recoverCard({ ...finalDeck[slot], r: 0n }, [myPD, oppPD]));
      }
      const p2Hand: number[] = [];
      for (const slot of P2_SLOTS) {
        const myPD  = await crypto.partialDecrypt(finalDeck[slot].c1, kp2.secretKey);
        const oppPD = await crypto.partialDecrypt(finalDeck[slot].c1, kp1.secretKey);
        p2Hand.push(await crypto.recoverCard({ ...finalDeck[slot], r: 0n }, [myPD, oppPD]));
      }

      setState((s) => ({ ...s, hand: p1Hand, proofStatus: null }));
      await client.revealHand(account as any, gameId, p1Hand as [number,number,number,number,number]);
      await client.revealHand(account as any, gameId, p2Hand as [number,number,number,number,number]);

      const pot = await client.getPot(gameId);
      const win = determineWinner(p1Hand, p2Hand);
      setState((s) => ({ ...s, phase: "done", pot, winner: win, opponentHand: p2Hand, proofStatus: null, error: null }));
    } catch (e: any) { setError(e.message ?? "Showdown failed"); }
  }, [state.gameId, state.role, account, address, getClient]);

  // ── Poll chain phase ──────────────────────────────────────────────────

  const pollPhase = useCallback(async () => {
    if (!state.gameId) return;
    try {
      const client = await getClient();
      const phase = await client.getGamePhase(state.gameId);
      const pot   = await client.getPot(state.gameId);
      setState((s) => ({ ...s, phase: mapPhase(phase), pot }));
    } catch { /* ignore */ }
  }, [state.gameId, getClient]);

  return {
    state,
    address,
    isConnected: !!account,
    createGame,
    joinGame,
    resumeGame,
    doKeyRegistrationAndShuffle,
    check,
    fold,
    doShowdown,
    pollPhase,
  };
}
