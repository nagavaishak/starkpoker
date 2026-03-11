/**
 * starknet.ts — PokerGame contract interaction layer
 *
 * Wraps starknet.js to provide typed calls/invokes for all PokerGame
 * entry points.  Works with any RPC endpoint (devnet, sepolia, mainnet).
 *
 * All write functions use account.execute() — the confirmed-working v9 API.
 * View functions use Contract with provider (read-only, no account needed).
 */

import {
  RpcProvider,
  Account,
} from "starknet";

// ─── ABI (minimal — only the functions we call) ───────────────────────────

export const POKER_GAME_ABI = [
  // ── Write functions ────────────────────────────────────────────────────
  {
    type: "function",
    name: "create_game",
    inputs: [{ name: "ante", type: "core::integer::u256" }],
    outputs: [{ type: "core::felt252" }],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "join_game",
    inputs: [{ name: "game_id", type: "core::felt252" }],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "register_public_key",
    inputs: [
      { name: "game_id", type: "core::felt252" },
      { name: "pk_x", type: "core::integer::u256" },
      { name: "pk_y", type: "core::integer::u256" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "submit_masked_deck",
    inputs: [
      { name: "game_id", type: "core::felt252" },
      {
        name: "cards",
        type: "core::array::Span::<core::felt252>",
      },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "submit_shuffle",
    inputs: [
      { name: "game_id", type: "core::felt252" },
      {
        name: "cards",
        type: "core::array::Span::<core::felt252>",
      },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "submit_partial_decrypt",
    inputs: [
      { name: "game_id", type: "core::felt252" },
      { name: "card_idx", type: "core::integer::u32" },
      { name: "pd_x", type: "core::integer::u256" },
      { name: "pd_y", type: "core::integer::u256" },
      {
        name: "full_proof_with_hints",
        type: "core::array::Span::<core::felt252>",
      },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "submit_partial_decrypt_raw",
    inputs: [
      { name: "game_id", type: "core::felt252" },
      { name: "card_idx", type: "core::integer::u32" },
      { name: "pd_x", type: "core::integer::u256" },
      { name: "pd_y", type: "core::integer::u256" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "get_pd_x",
    inputs: [
      { name: "game_id", type: "core::felt252" },
      { name: "player", type: "core::starknet::contract_address::ContractAddress" },
      { name: "card_idx", type: "core::integer::u32" },
    ],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "get_pd_y",
    inputs: [
      { name: "game_id", type: "core::felt252" },
      { name: "player", type: "core::starknet::contract_address::ContractAddress" },
      { name: "card_idx", type: "core::integer::u32" },
    ],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "get_deck_felt",
    inputs: [
      { name: "game_id", type: "core::felt252" },
      { name: "idx", type: "core::integer::u32" },
    ],
    outputs: [{ type: "core::felt252" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "place_bet",
    inputs: [
      { name: "game_id", type: "core::felt252" },
      { name: "amount", type: "core::integer::u256" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "call_bet",
    inputs: [{ name: "game_id", type: "core::felt252" }],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "fold",
    inputs: [{ name: "game_id", type: "core::felt252" }],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "check_action",
    inputs: [{ name: "game_id", type: "core::felt252" }],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "reveal_hand",
    inputs: [
      { name: "game_id", type: "core::felt252" },
      { name: "c0", type: "core::integer::u32" },
      { name: "c1", type: "core::integer::u32" },
      { name: "c2", type: "core::integer::u32" },
      { name: "c3", type: "core::integer::u32" },
      { name: "c4", type: "core::integer::u32" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "claim_timeout",
    inputs: [{ name: "game_id", type: "core::felt252" }],
    outputs: [],
    state_mutability: "external",
  },
  // ── View functions ────────────────────────────────────────────────────
  {
    type: "function",
    name: "get_game_phase",
    inputs: [{ name: "game_id", type: "core::felt252" }],
    outputs: [{ type: "starkpoker_contracts::poker_game::GamePhase" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "get_player1",
    inputs: [{ name: "game_id", type: "core::felt252" }],
    outputs: [{ type: "core::starknet::contract_address::ContractAddress" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "get_player2",
    inputs: [{ name: "game_id", type: "core::felt252" }],
    outputs: [{ type: "core::starknet::contract_address::ContractAddress" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "get_pot",
    inputs: [{ name: "game_id", type: "core::felt252" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "get_shuffle_step",
    inputs: [{ name: "game_id", type: "core::felt252" }],
    outputs: [{ type: "core::integer::u8" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "get_pending_bet",
    inputs: [{ name: "game_id", type: "core::felt252" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
] as const;

// ─── ERC20 ABI (approve + balance_of) ────────────────────────────────────

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "core::starknet::contract_address::ContractAddress" },
      { name: "amount", type: "core::integer::u256" },
    ],
    outputs: [{ type: "core::bool" }],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "balance_of",
    inputs: [
      { name: "account", type: "core::starknet::contract_address::ContractAddress" },
    ],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
] as const;

// ─── Game phase enum ──────────────────────────────────────────────────────

export enum GamePhase {
  WaitingForPlayer2 = 0,
  RegisteringKeys = 1,
  Shuffling = 2,
  Playing = 3,
  Showdown = 4,
  Done = 5,
}

export function phaseFromFelt(felt: bigint): GamePhase {
  return Number(felt) as GamePhase;
}

// ─── Client ───────────────────────────────────────────────────────────────

export interface PokerContracts {
  gameAddress: string;
  strkAddress: string;
}

// Compile u256 → ["low_dec", "high_dec"]
function u256cd(v: bigint): string[] {
  return [
    (v & ((1n << 128n) - 1n)).toString(),
    (v >> 128n).toString(),
  ];
}
// Normalize address → decimal string (felt252)
function addr(a: string): string {
  return BigInt(a).toString();
}

export class PokerContractClient {
  readonly provider: RpcProvider;
  readonly gameAddress: string;
  readonly strkAddress: string;

  constructor(rpcUrl: string, contracts: PokerContracts) {
    this.provider = new RpcProvider({ nodeUrl: rpcUrl });
    this.gameAddress = contracts.gameAddress;
    this.strkAddress = contracts.strkAddress;
  }

  // ── Approve STRK allowance then create a new game ─────────────────────

  async createGame(account: Account, ante: bigint): Promise<string> {
    const res = await account.execute([
      {
        contractAddress: this.strkAddress,
        entrypoint: "approve",
        calldata: [addr(this.gameAddress), ...u256cd(ante)],
      },
      {
        contractAddress: this.gameAddress,
        entrypoint: "create_game",
        calldata: u256cd(ante),
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const receipt = await account.waitForTransaction(res.transaction_hash) as any;
    return extractGameId(receipt, this.gameAddress);
  }

  // ── Join an existing game ─────────────────────────────────────────────

  async joinGame(account: Account, gameId: string): Promise<void> {
    const pot = await this.getPot(gameId);
    const res = await account.execute([
      {
        contractAddress: this.strkAddress,
        entrypoint: "approve",
        calldata: [addr(this.gameAddress), ...u256cd(pot)],
      },
      {
        contractAddress: this.gameAddress,
        entrypoint: "join_game",
        calldata: [gameId],
      },
    ]);
    await account.waitForTransaction(res.transaction_hash);
  }

  // ── Register Baby Jubjub public key ──────────────────────────────────

  async registerPublicKey(
    account: Account,
    gameId: string,
    pkX: bigint,
    pkY: bigint
  ): Promise<void> {
    const res = await account.execute([
      {
        contractAddress: this.gameAddress,
        entrypoint: "register_public_key",
        calldata: [gameId, ...u256cd(pkX), ...u256cd(pkY)],
      },
    ]);
    await account.waitForTransaction(res.transaction_hash);
  }

  // ── Submit masked deck (player 1) ─────────────────────────────────────

  async submitMaskedDeck(
    account: Account,
    gameId: string,
    cardFelts: string[]   // 416 felt252 hex strings
  ): Promise<void> {
    const res = await account.execute([
      {
        contractAddress: this.gameAddress,
        entrypoint: "submit_masked_deck",
        calldata: [gameId, cardFelts.length.toString(), ...cardFelts],
      },
    ]);
    await account.waitForTransaction(res.transaction_hash);
  }

  // ── Submit shuffle (player 2) ─────────────────────────────────────────

  async submitShuffle(
    account: Account,
    gameId: string,
    cardFelts: string[]   // 416 felt252 hex strings
  ): Promise<void> {
    const res = await account.execute([
      {
        contractAddress: this.gameAddress,
        entrypoint: "submit_shuffle",
        calldata: [gameId, cardFelts.length.toString(), ...cardFelts],
      },
    ]);
    await account.waitForTransaction(res.transaction_hash);
  }

  // ── Submit ZK partial decrypt ─────────────────────────────────────────

  async submitPartialDecrypt(
    account: Account,
    gameId: string,
    cardIdx: number,
    pdX: bigint,
    pdY: bigint,
    proofCalldata: string[]  // 2005 felt252 strings from garigaProofToCalldata()
  ): Promise<void> {
    const res = await account.execute([
      {
        contractAddress: this.gameAddress,
        entrypoint: "submit_partial_decrypt",
        calldata: [gameId, cardIdx.toString(), ...u256cd(pdX), ...u256cd(pdY), proofCalldata.length.toString(), ...proofCalldata],
      },
    ]);
    await account.waitForTransaction(res.transaction_hash);
  }

  // ── Betting actions ───────────────────────────────────────────────────

  async placeBet(account: Account, gameId: string, amount: bigint): Promise<void> {
    const res = await account.execute([
      { contractAddress: this.strkAddress, entrypoint: "approve", calldata: [addr(this.gameAddress), ...u256cd(amount)] },
      { contractAddress: this.gameAddress, entrypoint: "place_bet", calldata: [gameId, ...u256cd(amount)] },
    ]);
    await account.waitForTransaction(res.transaction_hash);
  }

  async callBet(account: Account, gameId: string): Promise<void> {
    const pending = await this.getPendingBet(gameId);
    const res = await account.execute([
      { contractAddress: this.strkAddress, entrypoint: "approve", calldata: [addr(this.gameAddress), ...u256cd(pending)] },
      { contractAddress: this.gameAddress, entrypoint: "call_bet", calldata: [gameId] },
    ]);
    await account.waitForTransaction(res.transaction_hash);
  }

  async fold(account: Account, gameId: string): Promise<void> {
    const res = await account.execute([
      { contractAddress: this.gameAddress, entrypoint: "fold", calldata: [gameId] },
    ]);
    await account.waitForTransaction(res.transaction_hash);
  }

  async checkAction(account: Account, gameId: string): Promise<void> {
    const res = await account.execute([
      { contractAddress: this.gameAddress, entrypoint: "check_action", calldata: [gameId] },
    ]);
    await account.waitForTransaction(res.transaction_hash);
  }

  // ── Reveal hand (showdown) ────────────────────────────────────────────

  async revealHand(
    account: Account,
    gameId: string,
    cardIndices: [number, number, number, number, number]
  ): Promise<void> {
    const res = await account.execute([
      { contractAddress: this.gameAddress, entrypoint: "reveal_hand", calldata: [gameId, ...cardIndices.map(String)] },
    ]);
    await account.waitForTransaction(res.transaction_hash);
  }

  // ── View functions (read-only — Contract + provider) ──────────────────

  async getGamePhase(gameId: string): Promise<GamePhase> {
    const result = await this.provider.callContract({
      contractAddress: this.gameAddress,
      entrypoint: "get_game_phase",
      calldata: [gameId],
    });
    return Number(result[0]) as GamePhase;
  }

  async getPot(gameId: string): Promise<bigint> {
    const result = await this.provider.callContract({
      contractAddress: this.gameAddress,
      entrypoint: "get_pot",
      calldata: [gameId],
    });
    // u256 → [low, high]
    const low  = BigInt(result[0]);
    const high = BigInt(result[1]);
    return low + high * (1n << 128n);
  }

  async getPendingBet(gameId: string): Promise<bigint> {
    const result = await this.provider.callContract({
      contractAddress: this.gameAddress,
      entrypoint: "get_pending_bet",
      calldata: [gameId],
    });
    const low  = BigInt(result[0]);
    const high = BigInt(result[1]);
    return low + high * (1n << 128n);
  }

  async getShuffleStep(gameId: string): Promise<number> {
    const result = await this.provider.callContract({
      contractAddress: this.gameAddress,
      entrypoint: "get_shuffle_step",
      calldata: [gameId],
    });
    return Number(result[0]);
  }

  async getPlayer1(gameId: string): Promise<string> {
    const result = await this.provider.callContract({
      contractAddress: this.gameAddress,
      entrypoint: "get_player1",
      calldata: [gameId],
    });
    return result[0];
  }

  async getPlayer2(gameId: string): Promise<string> {
    const result = await this.provider.callContract({
      contractAddress: this.gameAddress,
      entrypoint: "get_player2",
      calldata: [gameId],
    });
    return result[0];
  }

  async getPlayerPubKey(gameId: string, playerAddr: string): Promise<{ x: bigint; y: bigint } | null> {
    const [xr, yr] = await Promise.all([
      this.provider.callContract({ contractAddress: this.gameAddress, entrypoint: "get_pk_x", calldata: [gameId, playerAddr] }),
      this.provider.callContract({ contractAddress: this.gameAddress, entrypoint: "get_pk_y", calldata: [gameId, playerAddr] }),
    ]);
    const x = BigInt(xr[0]) + BigInt(xr[1]) * (1n << 128n);
    const y = BigInt(yr[0]) + BigInt(yr[1]) * (1n << 128n);
    return x === 0n ? null : { x, y };
  }

  // ── Submit raw partial decrypt (no ZK proof) ──────────────────────────
  // Batches all 5 slots in a single multicall tx.

  async submitPartialDecryptsBatch(
    account: Account,
    gameId: string,
    slots: number[],
    pds: Array<{ x: bigint; y: bigint }>
  ): Promise<void> {
    const calls = slots.map((slot, i) => ({
      contractAddress: this.gameAddress,
      entrypoint: "submit_partial_decrypt_raw",
      calldata: [gameId, slot.toString(), ...u256cd(pds[i].x), ...u256cd(pds[i].y)],
    }));
    const res = await account.execute(calls);
    await account.waitForTransaction(res.transaction_hash);
  }

  // ── Read one partial decrypt point from chain ──────────────────────────

  async getPartialDecrypt(
    gameId: string,
    playerAddr: string,
    cardIdx: number
  ): Promise<{ x: bigint; y: bigint } | null> {
    const [xr, yr] = await Promise.all([
      this.provider.callContract({ contractAddress: this.gameAddress, entrypoint: "get_pd_x", calldata: [gameId, playerAddr, cardIdx.toString()] }),
      this.provider.callContract({ contractAddress: this.gameAddress, entrypoint: "get_pd_y", calldata: [gameId, playerAddr, cardIdx.toString()] }),
    ]);
    const x = BigInt(xr[0]) + BigInt(xr[1]) * (1n << 128n);
    const y = BigInt(yr[0]) + BigInt(yr[1]) * (1n << 128n);
    return x === 0n ? null : { x, y };
  }

  // ── Read one deck slot (8 felts → MaskedCard) from chain ──────────────

  async getDeckSlot(gameId: string, slotIdx: number): Promise<{ c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint } }> {
    const base = slotIdx * 8;
    const reads = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        this.provider.callContract({ contractAddress: this.gameAddress, entrypoint: "get_deck_felt", calldata: [gameId, (base + i).toString()] })
      )
    );
    const f = reads.map(r => BigInt(r[0]));
    const u = (lo: bigint, hi: bigint) => lo + hi * (1n << 128n);
    return {
      c1: { x: u(f[0], f[1]), y: u(f[2], f[3]) },
      c2: { x: u(f[4], f[5]), y: u(f[6], f[7]) },
    };
  }

  async getHand(gameId: string, playerAddr: string): Promise<number[] | null> {
    try {
      const r = await this.provider.callContract({
        contractAddress: this.gameAddress,
        entrypoint: "get_hand",
        calldata: [gameId, playerAddr],
      });
      const cards = r.slice(0, 5).map(Number);
      if (cards.every(c => c === 0)) return null;
      return cards;
    } catch {
      return null;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract game_id from the GameCreated event in a create_game receipt.
 *
 * GameCreated { #[key] game_id, player1, ante }
 * → event.keys = [event_selector, game_id]
 * → event.from_address = game contract address
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGameId(receipt: any, gameAddress: string): string {
  // Normalize via BigInt to handle different leading-zero formats (0x030d... vs 0x30d...)
  const targetBig = BigInt(gameAddress);
  if (receipt.events) {
    for (const event of receipt.events) {
      if (!event.from_address || !event.keys || event.keys.length < 2) continue;
      try {
        if (BigInt(event.from_address) === targetBig) {
          // keys[0] = event selector, keys[1] = game_id (#[key] field)
          return event.keys[1];
        }
      } catch { /* skip malformed addresses */ }
    }
  }
  throw new Error("GameCreated event not found in receipt — check contract address and ABI");
}

/**
 * Build an Account from a private key + address (for devnet/sepolia).
 * starknet.js v9: Account constructor takes a single options object.
 */
export function buildAccount(
  rpcUrl: string,
  address: string,
  privateKey: string
): Account {
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (Account as any)({ provider, address, signer: privateKey });
}

/**
 * Convert a MaskedCard (from babyjubjub-starknet) to 8 felt252 hex strings
 * for flat deck storage in the Cairo contract.
 *
 * Layout per card (8 felts):
 *   [c1.x_low, c1.x_high, c1.y_low, c1.y_high,
 *    c2.x_low, c2.x_high, c2.y_low, c2.y_high]
 */
export function maskedCardToFelts(card: {
  c1: { x: bigint; y: bigint };
  c2: { x: bigint; y: bigint };
}): string[] {
  const MASK128 = (1n << 128n) - 1n;
  const toU256Felts = (v: bigint): [string, string] => [
    `0x${(v & MASK128).toString(16)}`,
    `0x${(v >> 128n).toString(16)}`,
  ];
  const [c1xl, c1xh] = toU256Felts(card.c1.x);
  const [c1yl, c1yh] = toU256Felts(card.c1.y);
  const [c2xl, c2xh] = toU256Felts(card.c2.x);
  const [c2yl, c2yh] = toU256Felts(card.c2.y);
  return [c1xl, c1xh, c1yl, c1yh, c2xl, c2xh, c2yl, c2yh];
}

/**
 * Convert a 52-card masked deck to the 416-element felt252 array
 * expected by submit_masked_deck / submit_shuffle.
 */
export function deckToCalldata(
  deck: Array<{ c1: { x: bigint; y: bigint }; c2: { x: bigint; y: bigint } }>
): string[] {
  return deck.flatMap(maskedCardToFelts);
}
