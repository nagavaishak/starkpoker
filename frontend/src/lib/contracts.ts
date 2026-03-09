/**
 * Contract addresses and chain config.
 * Update GAME_ADDRESS after Sepolia deployment.
 */

// Devnet (starknet-devnet --seed 42 --port 5050)
export const DEVNET_GAME_ADDRESS =
  "0x030d148d9cf1445f476eb2f6e084ff4480f3ccffb98d7ac1fad759c857e5b47c";
export const DEVNET_STRK_ADDRESS =
  "0x4718F5A0FC34CC1AF16A1CDEE98FFB20C31F5CD61D6AB07201858F4287C938D";
export const DEVNET_RPC = "http://localhost:5050";

// Sepolia
export const SEPOLIA_GAME_ADDRESS =
  process.env.NEXT_PUBLIC_GAME_ADDRESS ??
  "0x0006005f4adc7ceffeb86779ceedc89855ee5cb24f3841fa3dfe6a8d66059208";
export const SEPOLIA_STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
export const SEPOLIA_RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.cartridge.gg/x/starknet/sepolia";

// Active config — swap DEVNET_ ↔ SEPOLIA_ to switch networks
export const GAME_ADDRESS = SEPOLIA_GAME_ADDRESS;
export const STRK_ADDRESS = SEPOLIA_STRK_ADDRESS;
export const RPC_URL = SEPOLIA_RPC;

export const ANTE_DEFAULT = 1_000_000_000_000_000_000n; // 1 STRK

// Card display helpers
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["♣","♦","♥","♠"];
const SUIT_COLORS = ["text-green-800","text-red-600","text-red-600","text-gray-900"];

export interface CardDisplay {
  rank: string;
  suit: string;
  color: string;
  index: number;
}

export function cardDisplay(idx: number): CardDisplay {
  return {
    rank: RANKS[idx % 13],
    suit: SUITS[Math.floor(idx / 13)],
    color: SUIT_COLORS[Math.floor(idx / 13)],
    index: idx,
  };
}
