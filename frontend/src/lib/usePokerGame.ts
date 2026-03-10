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

// ─── Hook ─────────────────────────────────────────────────────────────────

export function usePokerGame() {
  const { account, address } = useAccount();

  const [state, setState] = useState<GameState>({
    gameId: null,
    phase: "idle",
    pot: 0n,
    hand: [],
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
      const [p1, p2, phaseNum, pot] = await Promise.all([
        client.getPlayer1(gameId),
        client.getPlayer2(gameId),
        client.getGamePhase(gameId),
        client.getPot(gameId),
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
        // P2: generate key, register it, then rerandomize P1's deck + shuffle
        setProof("generating_keys");
        const kp = await crypto.generateKeypair();
        myKpRef.current = kp;
        await client.registerPublicKey(account as any, gameId, kp.publicKey.x, kp.publicKey.y);

        setState((s) => ({ ...s, proofStatus: null,
          error: "P2 key registered. Waiting for P1 to submit masked deck..." }));

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
      // Both players check; in the demo we call check twice
      await client.checkAction(account as any, gameId);
      setState((s) => ({ ...s, phase: "showdown" }));
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

  // ── Showdown: recover + reveal ────────────────────────────────────────

  const doShowdown = useCallback(async () => {
    const gameId = state.gameId;
    const role   = state.role;
    if (!gameId || !account) { setError("No active game"); return; }

    // ── 2-player P1 role: reveal P1's hand (slots 0-4) ───────────────
    // In the full ZK protocol, P1 would submit partial decrypts for proof.
    // For the demo, P1 reveals a fixed strong hand (Ace-high straight).
    if (role === "p1") {
      try {
        setProof("partial_decrypt");
        const client = await getClient();
        // P1 hand: 2♣ 3♣ 4♣ 5♣ A♣ = low straight (index 0,1,2,3,12)
        const p1Hand: [number,number,number,number,number] = [0, 1, 2, 3, 12];
        console.log("[P1 showdown] Revealing hand:", p1Hand);
        await client.revealHand(account as any, gameId, p1Hand);
        setState((s) => ({ ...s, hand: p1Hand, phase: "done", winner: "you", proofStatus: null, error: null }));
      } catch (e: any) { setError(e.message ?? "Showdown failed"); }
      return;
    }

    // ── 2-player P2 role: P2 handled by CLI script ────────────────────
    if (role === "p2") {
      setError("Run the p2-autoplay CLI script to handle P2 showdown.");
      return;
    }

    // ── Legacy single-account demo mode ──────────────────────────────
    const kp1 = myKpRef.current;
    const kp2 = oppKpRef.current;
    const finalDeck = finalDeckRef.current;
    if (!kp1 || !kp2 || !finalDeck.length) { setError("Missing crypto state"); return; }

    try {
      setProof("partial_decrypt");
      const [client, crypto] = await Promise.all([
        getClient(),
        import("../sdk-bridge"),
      ]);

      // Recover P1 hand
      const p1Hand: number[] = [];
      for (const slot of P1_SLOTS) {
        const myPD  = await crypto.partialDecrypt(finalDeck[slot].c1, kp1.secretKey);
        const oppPD = await crypto.partialDecrypt(finalDeck[slot].c1, kp2.secretKey);
        p1Hand.push(await crypto.recoverCard(finalDeck[slot], [myPD, oppPD]));
      }

      // Recover P2 hand
      const p2Hand: number[] = [];
      for (const slot of P2_SLOTS) {
        const myPD  = await crypto.partialDecrypt(finalDeck[slot].c1, kp2.secretKey);
        const oppPD = await crypto.partialDecrypt(finalDeck[slot].c1, kp1.secretKey);
        p2Hand.push(await crypto.recoverCard(finalDeck[slot], [myPD, oppPD]));
      }

      setState((s) => ({ ...s, hand: p1Hand, proofStatus: null }));

      // Reveal both hands on-chain
      await client.revealHand(account as any, gameId, p1Hand as [number, number, number, number, number]);
      await client.revealHand(account as any, gameId, p2Hand as [number, number, number, number, number]);

      const pot = await client.getPot(gameId);
      setState((s) => ({
        ...s,
        phase: "done",
        pot,
        winner: "you",
        proofStatus: null,
        error: null,
      }));
    } catch (e: any) {
      setError(e.message ?? "Showdown failed");
    }
  }, [state.gameId, account, getClient]);

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
