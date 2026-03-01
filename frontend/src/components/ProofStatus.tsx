"use client";

import { useState, useEffect, useRef } from "react";
import type { ProofStatus } from "@/lib/usePokerGame";

const LABELS: Record<NonNullable<ProofStatus>, string> = {
  generating_keys: "Generating Baby Jubjub keypairs",
  masking_deck:    "Masking 52 cards with aggregate key",
  shuffling:       "Shuffling & rerandomising deck",
  partial_decrypt: "Computing partial decryptions",
  done:            "Cryptography complete",
};

interface ProofStatusProps {
  status: ProofStatus;
  elapsedMs?: number;
}

export function ProofStatusBar({ status, elapsedMs }: ProofStatusProps) {
  if (!status) return null;

  const isDone = status === "done";

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border w-full max-w-md
        ${isDone
          ? "bg-green-900/30 border-green-600 text-green-300"
          : "bg-blue-900/30 border-blue-600 text-blue-300"
        }`}
    >
      {!isDone && (
        <div className="w-4 h-4 shrink-0 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
      )}
      {isDone && <span className="text-green-400">✓</span>}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono truncate">{LABELS[status]}</p>
        {elapsedMs !== undefined && (
          <p className="text-xs opacity-60 mt-0.5">{elapsedMs.toLocaleString()} ms</p>
        )}
      </div>
    </div>
  );
}

/** Hook: tracks elapsed ms while a proof status is active */
export function useProofTimer(status: ProofStatus) {
  const [elapsed, setElapsed] = useState<number | undefined>(undefined);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (status && status !== "done") {
      startRef.current = Date.now();
      setElapsed(undefined);
      const id = setInterval(() => {
        setElapsed(Date.now() - (startRef.current ?? Date.now()));
      }, 100);
      return () => clearInterval(id);
    }
    if (status === "done" && startRef.current !== null) {
      setElapsed(Date.now() - startRef.current);
    }
  }, [status]);

  return elapsed;
}
