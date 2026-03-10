"use client";

import { useState } from "react";
import { useAccount } from "@starknet-react/core";
import { WalletConnect } from "./WalletConnect";
import { ANTE_DEFAULT } from "@/lib/contracts";

interface LobbyProps {
  onCreateGame: (ante: bigint) => Promise<string | undefined>;
  onJoinGame: (gameId: string) => Promise<void>;
  onResumeGame: (gameId: string) => Promise<void>;
  gameId: string | null;
  error: string | null;
  isLoading: boolean;
}

export function Lobby({ onCreateGame, onJoinGame, onResumeGame, gameId, error, isLoading }: LobbyProps) {
  const { status } = useAccount();
  const connected = status === "connected" || status === "reconnecting";

  const [anteEth, setAnteEth] = useState("0.001");
  const [joinId, setJoinId] = useState("");
  const [resumeId, setResumeId] = useState("");

  const handleCreate = async () => {
    const anteWei = BigInt(Math.round(parseFloat(anteEth) * 1e18));
    await onCreateGame(anteWei);
  };

  const handleJoin = async () => {
    if (!joinId.trim()) return;
    await onJoinGame(joinId.trim());
  };

  const handleResume = async () => {
    if (!resumeId.trim()) return;
    await onResumeGame(resumeId.trim());
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-green-900">
        <div>
          <h1 className="text-2xl font-bold text-yellow-400 tracking-wide">♠ StarkPoker</h1>
          <p className="text-xs text-gray-400">Trustless Mental Poker on Starknet</p>
        </div>
        <WalletConnect />
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 gap-10">
        <div className="text-center max-w-lg">
          <h2 className="text-4xl font-bold text-white mb-3">
            Deal cards.<br />
            <span className="text-yellow-400">Prove them.</span>
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            No server sees your cards. ZK proofs guarantee fairness on-chain.
            Powered by Baby Jubjub El Gamal encryption.
          </p>
        </div>

        {!connected ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-300">Connect a Starknet wallet to play</p>
            <WalletConnect />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-6 w-full max-w-xl">
            {/* Create game */}
            <div className="flex-1 bg-green-950/60 border border-green-800 rounded-xl p-5 flex flex-col gap-4">
              <h3 className="text-lg font-semibold text-yellow-300">Create Game</h3>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Buy-in (STRK)</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={anteEth}
                  onChange={(e) => setAnteEth(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-green-900/50 border border-green-700
                    text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={isLoading}
                className="w-full py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50
                  text-black font-bold transition-colors"
              >
                {isLoading ? "Creating…" : "Create Game"}
              </button>
              {gameId && (
                <div className="mt-2 p-2 rounded bg-green-900/40 border border-green-700">
                  <p className="text-xs text-gray-400 mb-1">Share this ID with Player 2:</p>
                  <p className="font-mono text-yellow-300 text-sm break-all">{gameId}</p>
                </div>
              )}
            </div>

            {/* Join game */}
            <div className="flex-1 bg-green-950/60 border border-green-800 rounded-xl p-5 flex flex-col gap-4">
              <h3 className="text-lg font-semibold text-yellow-300">Join Game</h3>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Game ID</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-green-900/50 border border-green-700
                    text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 font-mono text-sm"
                />
              </div>
              <button
                onClick={handleJoin}
                disabled={isLoading || !joinId.trim()}
                className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                  text-white font-bold transition-colors"
              >
                {isLoading ? "Joining…" : "Join Game"}
              </button>

              <div className="border-t border-green-800 pt-3 mt-1">
                <label className="text-xs text-gray-400 mb-1 block">Already a player? Resume:</label>
                <input
                  type="text"
                  placeholder="Game ID (0x0, 1, ...)"
                  value={resumeId}
                  onChange={(e) => setResumeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-green-900/50 border border-green-700
                    text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 font-mono text-sm mb-2"
                />
                <button
                  onClick={handleResume}
                  disabled={isLoading || !resumeId.trim()}
                  className="w-full py-2 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50
                    text-white font-bold transition-colors"
                >
                  {isLoading ? "Loading…" : "Resume Game"}
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-xl w-full p-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">
            ⚠ {error}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-gray-600">
        babyjubjub-starknet · Groth16 ZK · Barnett-Smart protocol
      </footer>
    </div>
  );
}
