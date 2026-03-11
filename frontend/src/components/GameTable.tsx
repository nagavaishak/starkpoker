"use client";

import { useState, useEffect } from "react";
import { HandDisplay } from "./Card";
import { ProofStatusBar, useProofTimer } from "./ProofStatus";
import { cardDisplay } from "@/lib/contracts";
import type { GameState } from "@/lib/usePokerGame";

interface GameTableProps {
  state: GameState;
  address: string | undefined;
  onCheck: () => void;
  onFold: () => void;
  onDoShuffle: () => void;
  onDoShowdown: () => void;
  onPollPhase: () => void;
}

// Hand evaluator (mirrors Cairo hand_eval.cairo)
const HAND_NAMES = [
  "High Card","Pair","Two Pair","Three of a Kind",
  "Straight","Flush","Full House","Four of a Kind","Straight Flush",
];
function handRank(cards: number[]): string {
  if (cards.length < 5) return "";
  const ranks = cards.map((c) => c % 13);
  const suits = cards.map((c) => Math.floor(c / 13));
  const flush = suits.every((s) => s === suits[0]);
  const sorted = [...ranks].sort((a, b) => a - b);
  let straight = (sorted[4] - sorted[0] === 4 && new Set(ranks).size === 5);
  if (sorted[0] === 0 && sorted[1] === 1 && sorted[2] === 2 && sorted[3] === 3 && sorted[4] === 12)
    straight = true;
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const vals = [...counts.values()].sort((a, b) => b - a);
  let rank = 0;
  if (flush && straight)                      rank = 8;
  else if (vals[0] === 4)                     rank = 7;
  else if (vals[0] === 3 && vals[1] === 2)    rank = 6;
  else if (flush)                             rank = 5;
  else if (straight)                          rank = 4;
  else if (vals[0] === 3)                     rank = 3;
  else if (vals[0] === 2 && vals[1] === 2)    rank = 2;
  else if (vals[0] === 2)                     rank = 1;
  return HAND_NAMES[rank];
}

function formatStrk(wei: bigint): string {
  const n = Number(wei) / 1e18;
  if (n === 0) return "0.00";
  if (n >= 0.01) return n.toFixed(2);
  return n.toFixed(4);
}

function shortAddr(addr: string | undefined): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function GameTable({
  state, address, onCheck, onFold, onDoShuffle, onDoShowdown, onPollPhase
}: GameTableProps) {
  const { phase, pot, hand, opponentHand, winner, proofStatus, error, gameId } = state;
  const elapsed = useProofTimer(proofStatus);

  // Auto-poll when waiting for opponent or for phase transitions
  useEffect(() => {
    if (phase === "waiting" || phase === "registering" || phase === "shuffling") {
      const id = setInterval(onPollPhase, 4000);
      return () => clearInterval(id);
    }
  }, [phase, onPollPhase]);

  const phaseLabel: Record<typeof phase, string> = {
    idle:        "Idle",
    waiting:     "Waiting for Player 2…",
    registering: "Registering keys…",
    shuffling:   "Shuffling deck…",
    playing:     "Betting round — check or fold",
    showdown:    "Showdown",
    done:        winner === "you"      ? "🏆 You win!"
               : winner === "opponent" ? "😔 Opponent wins"
               : winner === "tie"      ? "🤝 Tie game"
               :                        "Game over",
  };

  const isLoading = !!proofStatus && proofStatus !== "done";

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: "#090f0a" }}>
      {/* Grid background */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(201,168,76,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.04) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }} />
      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.65) 100%)",
      }} />
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-green-900/60">
        <div>
          <h1 className="text-xl font-bold text-yellow-400">♠ StarkPoker</h1>
          <p className="text-xs text-gray-500 font-mono">{shortAddr(address)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Game</p>
          <p className="text-xs font-mono text-green-400 truncate max-w-32">{gameId ?? "—"}</p>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 px-4 py-6">
        {/* Phase pill */}
        <div className="px-4 py-1.5 rounded-full bg-green-900/50 border border-green-700/60 text-sm text-green-300">
          {phaseLabel[phase]}
        </div>

        {/* Pot */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center
            shadow-lg shadow-yellow-500/30 text-black font-bold text-xs shrink-0">
            POT
          </div>
          <span className="text-3xl font-bold text-yellow-400 tabular-nums">
            {formatStrk(pot)} <span className="text-base font-normal text-yellow-600">STRK</span>
          </span>
        </div>

        {/* Proof status with elapsed time */}
        {proofStatus && (
          <ProofStatusBar status={proofStatus} elapsedMs={elapsed} />
        )}

        {/* Opponent hand */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-gray-500 uppercase tracking-widest">Opponent</p>
          <HandDisplay
            indices={opponentHand}
            revealed={(phase === "showdown" || phase === "done") && opponentHand.length > 0}
            size="sm"
          />
          {opponentHand.length === 5 && (phase === "showdown" || phase === "done") && (
            <p className="mt-1 text-gray-400 text-xs tracking-wide">
              {handRank(opponentHand)}
            </p>
          )}
        </div>

        {/* Table divider */}
        <div className="w-full max-w-md flex items-center gap-3">
          <div className="flex-1 h-px bg-green-800/40" />
          <span className="text-xs text-green-800">felt</span>
          <div className="flex-1 h-px bg-green-800/40" />
        </div>

        {/* Player hand */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-gray-500 uppercase tracking-widest">Your hand</p>
          <HandDisplay
            indices={hand}
            revealed={phase === "showdown" || phase === "done"}
            size="lg"
          />
          {hand.length === 5 && (phase === "showdown" || phase === "done") && (
            <p className="mt-1 text-yellow-300 font-semibold text-sm tracking-wide">
              {handRank(hand)}
            </p>
          )}
        </div>

        {/* Action area */}
        <div className="flex flex-col items-center gap-3 w-full max-w-md mt-2">

          {/* Refresh button — always visible except idle/done */}
          {phase !== "idle" && phase !== "done" && (
            <button
              onClick={onPollPhase}
              className="self-end text-xs text-green-600 hover:text-green-400 underline underline-offset-2 transition-colors"
            >
              ↻ Refresh
            </button>
          )}

          {/* Shuffle CTA */}
          {(phase === "registering" || phase === "shuffling") && (
            <button
              onClick={onDoShuffle}
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500
                disabled:opacity-40 disabled:cursor-not-allowed
                text-white font-bold text-lg transition-colors shadow-lg"
            >
              {isLoading ? "Working…" : "Register Keys & Shuffle Deck"}
            </button>
          )}

          {/* Betting */}
          {phase === "playing" && (
            <div className="flex gap-3 w-full">
              <button
                onClick={onCheck}
                disabled={isLoading}
                className="flex-1 py-3 rounded-xl bg-green-700 hover:bg-green-600
                  disabled:opacity-40 text-white font-bold transition-colors"
              >
                ✓ Check
              </button>
              <button
                onClick={onFold}
                disabled={isLoading}
                className="flex-1 py-3 rounded-xl bg-red-800 hover:bg-red-700
                  disabled:opacity-40 text-white font-bold transition-colors"
              >
                ✗ Fold
              </button>
            </div>
          )}

          {/* Showdown */}
          {phase === "showdown" && hand.length === 0 && (
            <button
              onClick={onDoShowdown}
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400
                disabled:opacity-40 text-black font-bold text-lg transition-colors shadow-lg"
            >
              {isLoading ? "Decrypting…" : "Reveal Hand & Settle"}
            </button>
          )}

          {/* Done */}
          {phase === "done" && (
            <div className={`w-full py-4 rounded-xl text-center font-bold text-xl border
              ${winner === "you"
                ? "bg-yellow-400/20 border-yellow-400 text-yellow-300"
                : winner === "opponent"
                ? "bg-red-900/30 border-red-700 text-red-300"
                : "bg-gray-700/20 border-gray-600 text-gray-300"
              }`}>
              {phaseLabel["done"]}
            </div>
          )}

          {/* Waiting hint */}
          {phase === "waiting" && (
            <p className="text-gray-400 text-sm text-center leading-relaxed">
              Share your Game ID with Player 2.<br />
              This page updates automatically when they join.
            </p>
          )}

          {/* Error */}
          {error && (
            <div className="w-full p-3 rounded-lg bg-red-900/40 border border-red-700
              text-red-300 text-sm flex gap-2 items-start">
              <span className="shrink-0">⚠</span>
              <span className="break-all">{error}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
