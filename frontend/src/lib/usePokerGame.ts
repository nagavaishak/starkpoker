"use client";

import { useState, useCallback, useRef } from "react";
import { useAccount } from "@starknet-react/core";
import { GAME_ADDRESS, STRK_ADDRESS, RPC_URL } from "./contracts";

// ─── Types ────────────────────────────────────────────────────────────────

export type GamePhase =
  | "idle"
  | "waiting"          // WaitingForPlayer2
  | "registering"      // RegisteringKeys
  | "shuffling"        // Shuffling
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
  });

  // Crypto & game state stored between renders
  const kp1Ref = useRef<any>(null);
  const kp2Ref = useRef<any>(null);
  const apkRef = useRef<any>(null);
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
      setState((s) => ({ ...s, gameId, phase: "waiting", pot: ante, proofStatus: null }));
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
      setState((s) => ({ ...s, gameId, phase: "registering", pot, proofStatus: null, error: null }));
    } catch (e: any) {
      setError(e.message ?? "joinGame failed");
    }
  }, [account, getClient]);

  // ── Register keys + shuffle ───────────────────────────────────────────

  const doKeyRegistrationAndShuffle = useCallback(async () => {
    const gameId = state.gameId;
    if (!gameId || !account) { setError("No active game"); return; }

    try {
      const [client, { deckToCalldata }, crypto] = await Promise.all([
        getClient(),
        import("../sdk-bridge"),
        import("../sdk-bridge"),
      ]);

      // Generate keypairs for both players (in a real 2-player game each
      // player has their own keypair; this demo runs both on same machine)
      setProof("generating_keys");
      const kp1 = await crypto.generateKeypair();
      const kp2 = await crypto.generateKeypair();
      kp1Ref.current = kp1;
      kp2Ref.current = kp2;

      await client.registerPublicKey(account as any, gameId, kp1.publicKey.x, kp1.publicKey.y);
      await client.registerPublicKey(account as any, gameId, kp2.publicKey.x, kp2.publicKey.y);

      // Compute aggregate public key
      const apk = await crypto.computeAggregateKey(kp1.publicKey, kp2.publicKey);
      apkRef.current = apk;

      // P1: mask + shuffle
      setProof("masking_deck");
      const initialDeck = [];
      for (let i = 0; i < 52; i++) initialDeck.push(await crypto.maskCard(i, apk));
      const { shuffled: p1Deck } = await crypto.shuffleDeck(initialDeck);
      await client.submitMaskedDeck(account as any, gameId, deckToCalldata(p1Deck));

      // P2: rerandomize + shuffle
      setProof("shuffling");
      const p2Pre = await crypto.rerandomizeDeck(p1Deck, apk);
      const { shuffled: finalDeck } = await crypto.shuffleDeck(p2Pre);
      await client.submitShuffle(account as any, gameId, deckToCalldata(finalDeck));

      finalDeckRef.current = finalDeck;
      const pot = await client.getPot(gameId);
      setState((s) => ({ ...s, phase: "playing", pot, proofStatus: null, error: null }));
    } catch (e: any) {
      setError(e.message ?? "Shuffle failed");
    }
  }, [state.gameId, account, getClient]);

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
    if (!gameId || !account) { setError("No active game"); return; }
    const kp1 = kp1Ref.current;
    const kp2 = kp2Ref.current;
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
        winner: "you", // simplified; real winner from on-chain settle event
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
    doKeyRegistrationAndShuffle,
    check,
    fold,
    doShowdown,
    pollPhase,
  };
}
