"use client";

import { useState, useCallback, useRef } from "react";
import type { ProofStatus } from "@/lib/usePokerGame";

// ─── Devnet constants (starknet-devnet --seed 42 --port 5050) ─────────────

const RPC_URL    = "http://localhost:5050";
const GAME_ADDR  = "0x030d148d9cf1445f476eb2f6e084ff4480f3ccffb98d7ac1fad759c857e5b47c";
const STRK_ADDR  = "0x4718F5A0FC34CC1AF16A1CDEE98FFB20C31F5CD61D6AB07201858F4287C938D";
const ANTE       = 1_000_000_000_000_000_000n; // 1 STRK

const P1_ADDR = "0x034ba56f92265f0868c57d3fe72ecab144fc96f97954bbbc4252cef8e8a979ba";
const P1_KEY  = "0x00000000000000000000000000000000b137668388dbe9acdfa3bc734cc2c469";
const P2_ADDR = "0x02939f2dc3f80cc7d620e8a86f2e69c1e187b7ff44b74056647368b5c49dc370";
const P2_KEY  = "0x00000000000000000000000000000000e8c2801d899646311100a661d32587aa";

const P1_SLOTS = [0, 1, 2, 3, 4];
const P2_SLOTS = [5, 6, 7, 8, 9];

// ─── Hand scoring (mirrors Cairo) ─────────────────────────────────────────

function handScore(cards: number[]): number {
  const ranks = cards.map(c => c % 13);
  const suits = cards.map(c => Math.floor(c / 13));
  const flush = suits.every(s => s === suits[0]);
  const sorted = [...ranks].sort((a,b) => a-b);
  let straight = sorted[4]-sorted[0]===4 && new Set(ranks).size===5;
  if (sorted[0]===0&&sorted[1]===1&&sorted[2]===2&&sorted[3]===3&&sorted[4]===12) straight=true;
  const counts = new Map<number,number>();
  for (const r of ranks) counts.set(r,(counts.get(r)??0)+1);
  const vals = [...counts.values()].sort((a,b)=>b-a);
  let rank=0;
  if(flush&&straight)rank=8; else if(vals[0]===4)rank=7;
  else if(vals[0]===3&&vals[1]===2)rank=6; else if(flush)rank=5;
  else if(straight)rank=4; else if(vals[0]===3)rank=3;
  else if(vals[0]===2&&vals[1]===2)rank=2; else if(vals[0]===2)rank=1;
  return rank*10000+Math.max(...ranks)*100+ranks.reduce((a,b)=>a+b,0);
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export interface DemoState {
  step: number;
  log: string[];
  proofStatus: ProofStatus;
  elapsed: number | undefined;
  pot: bigint;
  p1Hand: number[];
  p2Hand: number[];
  gameId: string | null;
  error: string | null;
  isRunning: boolean;
  isDone: boolean;
  p1Winner: boolean;
  p2Winner: boolean;
  runDemo: () => void;
  reset: () => void;
}

export function useDemo(): DemoState {
  const [step, setStep]               = useState(0);
  const [log, setLog]                 = useState<string[]>([]);
  const [proofStatus, setProofStatus] = useState<ProofStatus>(null);
  const [elapsed, setElapsed]         = useState<number | undefined>(undefined);
  const [pot, setPot]                 = useState<bigint>(0n);
  const [p1Hand, setP1Hand]           = useState<number[]>([]);
  const [p2Hand, setP2Hand]           = useState<number[]>([]);
  const [gameId, setGameId]           = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [isRunning, setIsRunning]     = useState(false);
  const [isDone, setIsDone]           = useState(false);
  const [p1Winner, setP1Winner]       = useState(false);
  const [p2Winner, setP2Winner]       = useState(false);

  const startTs = useRef<number>(0);

  const addLog = (line: string) => setLog(l => [...l, line]);

  const startProof = (status: ProofStatus) => {
    setProofStatus(status);
    startTs.current = Date.now();
    setElapsed(undefined);
  };
  const endProof = () => {
    setElapsed(Date.now() - startTs.current);
    setProofStatus("done");
    setTimeout(() => setProofStatus(null), 2000);
  };

  const reset = () => {
    setStep(0); setLog([]); setProofStatus(null); setElapsed(undefined);
    setPot(0n); setP1Hand([]); setP2Hand([]); setGameId(null);
    setError(null); setIsRunning(false); setIsDone(false);
    setP1Winner(false); setP2Winner(false);
  };

  const runDemo = useCallback(async () => {
    reset();
    setIsRunning(true);

    try {
      // ── Dynamic imports (WASM-safe) ─────────────────────────────────────
      const [
        { PokerContractClient, buildAccount, deckToCalldata },
        { generateKeypair, computeAggregateKey, maskCard, shuffleDeck,
          rerandomizeDeck, partialDecrypt, recoverCard },
      ] = await Promise.all([
        import("@/sdk-bridge"),
        import("@/sdk-bridge"),
      ]);

      const client = new PokerContractClient(RPC_URL, {
        gameAddress: GAME_ADDR,
        strkAddress: STRK_ADDR,
      });
      const p1 = buildAccount(RPC_URL, P1_ADDR, P1_KEY);
      const p2 = buildAccount(RPC_URL, P2_ADDR, P2_KEY);

      // ── Step 1: P1 creates game ──────────────────────────────────────────
      setStep(1);
      addLog("Step 1: P1 creates game…");
      const gId = await client.createGame(p1 as any, ANTE);
      setGameId(gId);
      setPot(ANTE);
      addLog(`✅ Game created: ${gId}`);

      // ── Step 2: P2 joins ─────────────────────────────────────────────────
      setStep(2);
      addLog("Step 2: P2 joins…");
      await client.joinGame(p2 as any, gId);
      setPot(ANTE * 2n);
      addLog("✅ P2 joined. Pot = 2 STRK");

      // ── Step 3: Register keys ────────────────────────────────────────────
      setStep(3);
      startProof("generating_keys");
      addLog("Step 3: Generating Baby Jubjub keypairs…");
      const kp1 = await generateKeypair();
      const kp2 = await generateKeypair();
      const apk = await computeAggregateKey(kp1.publicKey, kp2.publicKey);
      endProof();
      addLog(`  kp1.pk.x = 0x${kp1.publicKey.x.toString(16).slice(0, 16)}…`);

      await client.registerPublicKey(p1 as any, gId, kp1.publicKey.x, kp1.publicKey.y);
      await client.registerPublicKey(p2 as any, gId, kp2.publicKey.x, kp2.publicKey.y);
      addLog("✅ Both keys registered");

      // ── Step 4: Mask & shuffle ───────────────────────────────────────────
      setStep(4);
      startProof("masking_deck");
      addLog("Step 4: P1 masking 52 cards…");
      const t0 = Date.now();
      const initialDeck = [];
      for (let i = 0; i < 52; i++) initialDeck.push(await maskCard(i, apk));
      addLog(`  Masked in ${Date.now() - t0}ms`);

      const { shuffled: p1Deck } = await shuffleDeck(initialDeck);
      await client.submitMaskedDeck(p1 as any, gId, deckToCalldata(p1Deck));
      addLog("✅ P1 deck submitted");

      startProof("shuffling");
      addLog("Step 4b: P2 rerandomises & shuffles…");
      const p2Pre = await rerandomizeDeck(p1Deck, apk);
      const { shuffled: finalDeck } = await shuffleDeck(p2Pre);
      await client.submitShuffle(p2 as any, gId, deckToCalldata(finalDeck));
      endProof();
      addLog("✅ Final deck on-chain. Phase = Playing");

      // ── Step 5: Both check ───────────────────────────────────────────────
      setStep(5);
      addLog("Step 5: P1 checks…");
      await client.checkAction(p1 as any, gId);
      addLog("Step 5: P2 checks…");
      await client.checkAction(p2 as any, gId);
      addLog("✅ Phase = Showdown");

      // ── Step 6: Partial decrypt & recover hands ──────────────────────────
      setStep(6);
      startProof("partial_decrypt");
      addLog("Step 6: Computing partial decryptions…");

      const p1HandArr: number[] = [];
      for (const slot of P1_SLOTS) {
        const myPD  = await partialDecrypt(finalDeck[slot].c1, kp1.secretKey);
        const oppPD = await partialDecrypt(finalDeck[slot].c1, kp2.secretKey);
        p1HandArr.push(await recoverCard(finalDeck[slot], [myPD, oppPD]));
      }
      const p2HandArr: number[] = [];
      for (const slot of P2_SLOTS) {
        const myPD  = await partialDecrypt(finalDeck[slot].c1, kp2.secretKey);
        const oppPD = await partialDecrypt(finalDeck[slot].c1, kp1.secretKey);
        p2HandArr.push(await recoverCard(finalDeck[slot], [myPD, oppPD]));
      }
      endProof();

      setP1Hand(p1HandArr);
      setP2Hand(p2HandArr);

      addLog(`  P1 hand: ${p1HandArr.map(i => `${['2','3','4','5','6','7','8','9','T','J','Q','K','A'][i%13]}${['♣','♦','♥','♠'][Math.floor(i/13)]}`).join(' ')}`);
      addLog(`  P2 hand: ${p2HandArr.map(i => `${['2','3','4','5','6','7','8','9','T','J','Q','K','A'][i%13]}${['♣','♦','♥','♠'][Math.floor(i/13)]}`).join(' ')}`);

      // Reveal on-chain
      await client.revealHand(p1 as any, gId, p1HandArr as [number,number,number,number,number]);
      await client.revealHand(p2 as any, gId, p2HandArr as [number,number,number,number,number]);
      addLog("✅ Both hands revealed on-chain. Pot settled.");

      const finalPot = await client.getPot(gId);
      setPot(finalPot);

      // Determine winner
      const s1 = handScore(p1HandArr);
      const s2 = handScore(p2HandArr);
      setP1Winner(s1 >= s2);
      setP2Winner(s2 > s1);
      addLog(`✅ ${s1 > s2 ? "P1 wins!" : s2 > s1 ? "P2 wins!" : "Tie!"} (scores: ${s1} vs ${s2})`);

      setStep(7);
    } catch (e: any) {
      setError(e.message ?? String(e));
      addLog(`❌ Error: ${e.message ?? e}`);
    } finally {
      setIsRunning(false);
      setIsDone(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    step, log, proofStatus, elapsed,
    pot, p1Hand, p2Hand, gameId, error,
    isRunning, isDone,
    p1Winner, p2Winner,
    runDemo, reset,
  };
}
