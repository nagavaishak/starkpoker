"use client";

import { useDemo } from "./useDemo";
import { HandDisplay } from "@/components/Card";
import { ProofStatusBar } from "@/components/ProofStatus";

// ─── Card & hand helpers ──────────────────────────────────────────────────

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["♣","♦","♥","♠"];
const HAND_NAMES = [
  "High Card","Pair","Two Pair","Three of a Kind",
  "Straight","Flush","Full House","Four of a Kind","Straight Flush",
];

function cardName(i: number) { return RANKS[i % 13] + SUITS[Math.floor(i / 13)]; }

function handRank(cards: number[]): string {
  if (cards.length < 5) return "";
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
  return HAND_NAMES[rank];
}

function formatStrk(wei: bigint) { return (Number(wei)/1e18).toFixed(2); }

// ─── Step progress bar ────────────────────────────────────────────────────

const STEPS = [
  "Create game",
  "P2 joins",
  "Register keys",
  "Mask & shuffle",
  "Betting",
  "Decrypt & reveal",
  "Done",
];

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 w-full max-w-lg overflow-x-auto pb-1">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-1 shrink-0">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs whitespace-nowrap
            ${i < step  ? "bg-green-800 text-green-300"
            : i === step ? "bg-yellow-500 text-black font-bold"
            :              "bg-gray-800 text-gray-500"}`}>
            {i < step ? "✓" : i+1}. {label}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-4 h-px ${i < step ? "bg-green-700" : "bg-gray-700"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function DemoPage() {
  const {
    step, log, proofStatus, elapsed,
    pot, p1Hand, p2Hand, gameId, error,
    isRunning, isDone,
    runDemo, reset,
    p1Winner, p2Winner,
  } = useDemo();

  const showdown = p1Hand.length === 5 || p2Hand.length === 5;

  return (
    <div className="min-h-screen bg-[#0f1f15] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-green-900/60">
        <div>
          <h1 className="text-2xl font-bold text-yellow-400">♠ StarkPoker</h1>
          <p className="text-xs text-gray-500">Demo Mode — devnet · no wallet required</p>
        </div>
        <div className="flex gap-3">
          <a href="/" className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 hover:bg-gray-700 transition-colors">
            ← Live game
          </a>
          {isDone && (
            <button
              onClick={reset}
              className="px-3 py-1.5 rounded-lg text-sm bg-green-800 hover:bg-green-700 transition-colors"
            >
              Play again
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center gap-6 px-4 py-8">
        {/* Intro */}
        {step === 0 && !isRunning && (
          <div className="max-w-lg text-center flex flex-col items-center gap-6">
            <h2 className="text-3xl font-bold">
              Trustless Mental Poker<br />
              <span className="text-yellow-400">on Starknet</span>
            </h2>
            <p className="text-gray-400 leading-relaxed text-sm">
              This demo runs a complete 5-card draw game on <strong>starknet-devnet</strong>.
              Cards are encrypted with Baby Jubjub El Gamal. Decryption is proven via
              Groth16 ZK proofs verified on-chain by a Garaga verifier.
              <br /><br />
              No wallet extension required — two pre-funded devnet accounts are used.
            </p>
            <div className="grid grid-cols-2 gap-4 w-full text-sm">
              {[
                ["🔐", "El Gamal encryption", "Baby Jubjub curve"],
                ["🔀", "Double shuffle", "Commit-reveal protocol"],
                ["🔍", "ZK proofs", "Groth16 via Garaga"],
                ["⛓", "On-chain settle", "starknet-devnet"],
              ].map(([icon, title, sub]) => (
                <div key={title} className="bg-green-950/60 border border-green-800/50 rounded-xl p-3">
                  <p className="text-lg">{icon}</p>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="text-gray-400 text-xs">{sub}</p>
                </div>
              ))}
            </div>
            <button
              onClick={runDemo}
              className="w-full py-4 rounded-xl bg-yellow-500 hover:bg-yellow-400
                text-black font-bold text-xl transition-colors shadow-xl"
            >
              ▶ Run Demo
            </button>
            <p className="text-xs text-gray-600">
              Requires starknet-devnet running at localhost:5050 with --seed 42
            </p>
          </div>
        )}

        {/* Running / done state */}
        {(isRunning || isDone) && (
          <>
            <StepBar step={step} />

            {/* Pot */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-yellow-400 flex items-center justify-center
                text-black font-bold text-xs">POT</div>
              <span className="text-2xl font-bold text-yellow-400">
                {formatStrk(pot)} STRK
              </span>
              {gameId && (
                <span className="text-xs text-gray-500 font-mono hidden sm:block">
                  #{gameId}
                </span>
              )}
            </div>

            {/* Proof status */}
            {proofStatus && <ProofStatusBar status={proofStatus} elapsedMs={elapsed} />}

            {/* Hands */}
            <div className="flex flex-col sm:flex-row gap-8 items-center sm:items-start justify-center w-full">
              {/* P2 hand */}
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-gray-500 uppercase tracking-widest">Player 2</p>
                <HandDisplay
                  indices={p2Hand}
                  revealed={showdown}
                  size="md"
                />
                {p2Hand.length === 5 && showdown && (
                  <div className="text-center">
                    <p className="text-blue-300 text-sm font-semibold">{handRank(p2Hand)}</p>
                    <p className="text-xs text-gray-500">{p2Hand.map(cardName).join(" ")}</p>
                    {p2Winner && <p className="text-yellow-300 font-bold mt-1">🏆 Wins!</p>}
                  </div>
                )}
              </div>

              {/* VS divider */}
              {showdown && (
                <div className="flex items-center justify-center w-10 h-10 rounded-full
                  bg-green-900 border border-green-700 text-sm font-bold text-green-300 shrink-0 mt-8">
                  VS
                </div>
              )}

              {/* P1 hand */}
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-gray-500 uppercase tracking-widest">Player 1</p>
                <HandDisplay
                  indices={p1Hand}
                  revealed={showdown}
                  size="md"
                />
                {p1Hand.length === 5 && showdown && (
                  <div className="text-center">
                    <p className="text-green-300 text-sm font-semibold">{handRank(p1Hand)}</p>
                    <p className="text-xs text-gray-500">{p1Hand.map(cardName).join(" ")}</p>
                    {p1Winner && <p className="text-yellow-300 font-bold mt-1">🏆 Wins!</p>}
                  </div>
                )}
              </div>
            </div>

            {/* Activity log */}
            <div className="w-full max-w-lg">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Log</p>
              <div className="bg-black/40 border border-green-900/50 rounded-xl p-4
                font-mono text-xs max-h-48 overflow-y-auto flex flex-col gap-1">
                {log.map((line, i) => (
                  <p key={i} className={
                    line.startsWith("✅") ? "text-green-400"
                    : line.startsWith("❌") ? "text-red-400"
                    : line.startsWith("  ") ? "text-gray-500"
                    : "text-gray-300"
                  }>
                    {line}
                  </p>
                ))}
                {isRunning && (
                  <p className="text-blue-400 animate-pulse">…</p>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="w-full max-w-lg p-3 rounded-lg bg-red-900/40 border border-red-700
                text-red-300 text-sm">
                ⚠ {error}
              </div>
            )}

            {/* Done result */}
            {isDone && !error && (
              <div className="w-full max-w-lg py-4 rounded-xl text-center font-bold text-xl border
                bg-yellow-400/20 border-yellow-400 text-yellow-300">
                {p1Winner ? "Player 1 wins!" : p2Winner ? "Player 2 wins!" : "Tie game!"}
                {" "}Pot settled on-chain. ✓
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
