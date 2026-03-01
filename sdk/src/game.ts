/**
 * game.ts — High-level PokerGame orchestration
 *
 * Manages the full 2-player game lifecycle:
 *   create → join → register keys → shuffle → deal → bet → showdown
 *
 * Crypto (Baby Jubjub El Gamal) is handled by babyjubjub-starknet.
 * Contract calls are delegated to PokerContractClient.
 */

import type { Account } from "starknet";
import {
  generateKeypair,
  computeAggregateKey,
  maskCard,
  partialDecrypt,
  recoverCard,
  shuffleDeck,
  rerandomizeDeck,
  type BJJKeypair,
  type MaskedCard,
  type BJJPoint,
} from "babyjubjub-starknet";
import {
  PokerContractClient,
  GamePhase,
  deckToCalldata,
  type PokerContracts,
} from "./starknet.js";

// ─── Types ────────────────────────────────────────────────────────────────

export interface PlayerState {
  account: Account;
  keypair: BJJKeypair;
  /** Indices of the 5 cards dealt from the final deck */
  handIndices: number[];
  /** Partial decrypts this player has received (indexed by card position 0-4) */
  receivedPDs: Map<number, BJJPoint>;
}

export interface GameState {
  gameId: string;
  phase: GamePhase;
  pot: bigint;
  /** Final shuffled deck (52 masked cards) */
  deck: MaskedCard[];
  /** Aggregate public key of both players */
  apk: BJJPoint | null;
}

// ─── Card assignment constants ────────────────────────────────────────────

// 5-card draw: P1 gets deck slots 0-4, P2 gets slots 5-9
const P1_HAND_SLOTS = [0, 1, 2, 3, 4];
const P2_HAND_SLOTS = [5, 6, 7, 8, 9];

// ─── PokerGame orchestration class ───────────────────────────────────────

export class PokerGame {
  private client: PokerContractClient;
  private state: GameState;
  private players: Map<"p1" | "p2", PlayerState> = new Map();

  constructor(rpcUrl: string, contracts: PokerContracts) {
    this.client = new PokerContractClient(rpcUrl, contracts);
    this.state = {
      gameId: "",
      phase: GamePhase.WaitingForPlayer2,
      pot: 0n,
      deck: [],
      apk: null,
    };
  }

  // ─── Phase 1: Setup ────────────────────────────────────────────────────

  /**
   * Player 1 creates the game and posts the ante.
   * Returns the game_id.
   */
  async createGame(p1Account: Account, ante: bigint): Promise<string> {
    console.log("  [P1] Creating game with ante:", formatStrk(ante), "STRK");
    const gameId = await this.client.createGame(p1Account, ante);

    const keypair = await generateKeypair();
    this.players.set("p1", {
      account: p1Account,
      keypair,
      handIndices: P1_HAND_SLOTS.slice(),
      receivedPDs: new Map(),
    });

    this.state.gameId = gameId;
    this.state.phase = GamePhase.WaitingForPlayer2;
    this.state.pot = ante;

    console.log("  [P1] Game created. ID:", gameId);
    return gameId;
  }

  /**
   * Player 2 joins and posts the matching ante.
   */
  async joinGame(p2Account: Account, gameId: string): Promise<void> {
    console.log("  [P2] Joining game:", gameId);
    await this.client.joinGame(p2Account, gameId);

    const keypair = await generateKeypair();
    this.players.set("p2", {
      account: p2Account,
      keypair,
      handIndices: P2_HAND_SLOTS.slice(),
      receivedPDs: new Map(),
    });

    this.state.phase = GamePhase.RegisteringKeys;
    console.log("  [P2] Joined.");
  }

  // ─── Phase 2: Key registration ────────────────────────────────────────

  /**
   * Both players register their Baby Jubjub public keys on-chain.
   * The aggregate public key is computed from both and used for masking.
   */
  async registerBothKeys(): Promise<void> {
    const p1 = this.players.get("p1")!;
    const p2 = this.players.get("p2")!;
    const gameId = this.state.gameId;

    console.log("  [P1] Registering public key...");
    await this.client.registerPublicKey(
      p1.account,
      gameId,
      p1.keypair.publicKey.x,
      p1.keypair.publicKey.y
    );

    console.log("  [P2] Registering public key...");
    await this.client.registerPublicKey(
      p2.account,
      gameId,
      p2.keypair.publicKey.x,
      p2.keypair.publicKey.y
    );

    // Compute aggregate public key for masking
    this.state.apk = await computeAggregateKey(
      p1.keypair.publicKey,
      p2.keypair.publicKey
    );

    this.state.phase = GamePhase.Shuffling;
    console.log("  Keys registered. APK computed.");
  }

  // ─── Phase 3: Shuffle ─────────────────────────────────────────────────

  /**
   * Player 1 masks and shuffles the 52-card deck, submits it on-chain.
   * Player 2 re-randomises (rerandomize) and re-shuffles, submits on-chain.
   * After both: phase = Playing.
   */
  async shuffleDeck(): Promise<void> {
    const p1 = this.players.get("p1")!;
    const p2 = this.players.get("p2")!;
    const apk = this.state.apk!;
    const gameId = this.state.gameId;

    // ── P1: mask all 52 cards and shuffle ──────────────────────────────
    console.log("  [P1] Masking and shuffling 52 cards...");
    const initialDeck: MaskedCard[] = [];
    for (let i = 0; i < 52; i++) {
      initialDeck.push(await maskCard(i, apk));
    }
    const { shuffled: p1Deck } = await shuffleDeck(initialDeck);
    const p1Calldata = deckToCalldata(p1Deck);

    console.log("  [P1] Submitting masked deck (416 felts)...");
    await this.client.submitMaskedDeck(p1.account, gameId, p1Calldata);

    // ── P2: rerandomize and re-shuffle ─────────────────────────────────
    console.log("  [P2] Rerandomising and reshuffling...");
    const p2DeckBeforeShuffle = await rerandomizeDeck(p1Deck, apk);
    const { shuffled: p2Deck } = await shuffleDeck(p2DeckBeforeShuffle);
    const p2Calldata = deckToCalldata(p2Deck);

    console.log("  [P2] Submitting shuffled deck...");
    await this.client.submitShuffle(p2.account, gameId, p2Calldata);

    // Store the final deck locally for dealing
    this.state.deck = p2Deck;
    this.state.phase = GamePhase.Playing;
    console.log("  Deck shuffled. Phase = Playing.");
  }

  // ─── Phase 4: Partial decryption ──────────────────────────────────────

  /**
   * Each player submits partial decrypts for the OPPONENT's hand cards.
   *
   * In v1 (no proof): submits empty proof — contract call still goes through
   * because this is tested on devnet where the verifier is a dummy.
   *
   * In v2 (full ZK): pass real garigaProofToCalldata() output.
   *
   * @param proofCalldata - 2005 felt252 strings, or [] for mock (devnet only)
   */
  async submitPartialDecryptsForOpponent(
    role: "p1" | "p2",
    proofCalldata: string[] = []
  ): Promise<void> {
    const player = this.players.get(role)!;
    const opponentSlots = role === "p1" ? P2_HAND_SLOTS : P1_HAND_SLOTS;
    const gameId = this.state.gameId;

    for (const slotIdx of opponentSlots) {
      const card = this.state.deck[slotIdx];
      const pd = await partialDecrypt(card.c1, player.keypair.secretKey);

      console.log(
        `  [${role.toUpperCase()}] Partial decrypt for card slot ${slotIdx}:`,
        `pd.x = 0x${pd.x.toString(16).slice(0, 16)}...`
      );

      await this.client.submitPartialDecrypt(
        player.account,
        gameId,
        slotIdx,
        pd.x,
        pd.y,
        proofCalldata
      );
    }
  }

  // ─── Phase 5: Betting ─────────────────────────────────────────────────

  async bothCheck(): Promise<void> {
    const p1 = this.players.get("p1")!;
    const p2 = this.players.get("p2")!;
    const gameId = this.state.gameId;

    console.log("  [P1] Check.");
    await this.client.checkAction(p1.account, gameId);
    console.log("  [P2] Check.");
    await this.client.checkAction(p2.account, gameId);

    this.state.phase = GamePhase.Showdown;
    console.log("  Both checked. Phase = Showdown.");
  }

  async p1Bets(amount: bigint): Promise<void> {
    const p1 = this.players.get("p1")!;
    console.log("  [P1] Bet:", formatStrk(amount), "STRK");
    await this.client.placeBet(p1.account, this.state.gameId, amount);
  }

  async p2Calls(): Promise<void> {
    const p2 = this.players.get("p2")!;
    console.log("  [P2] Call.");
    await this.client.callBet(p2.account, this.state.gameId);
    this.state.phase = GamePhase.Showdown;
  }

  async p1Folds(): Promise<void> {
    const p1 = this.players.get("p1")!;
    console.log("  [P1] Fold.");
    await this.client.fold(p1.account, this.state.gameId);
    this.state.phase = GamePhase.Done;
  }

  async p2Folds(): Promise<void> {
    const p2 = this.players.get("p2")!;
    console.log("  [P2] Fold.");
    await this.client.fold(p2.account, this.state.gameId);
    this.state.phase = GamePhase.Done;
  }

  // ─── Phase 6: Showdown ────────────────────────────────────────────────

  /**
   * Recover own hand from the deck using partial decrypts from both players.
   * Returns the 5 card indices (0-51).
   */
  async recoverHand(role: "p1" | "p2"): Promise<number[]> {
    const player = this.players.get(role)!;
    const opponentRole = role === "p1" ? "p2" : "p1";
    const opponent = this.players.get(opponentRole)!;
    const mySlots = role === "p1" ? P1_HAND_SLOTS : P2_HAND_SLOTS;

    const hand: number[] = [];

    for (const slotIdx of mySlots) {
      const card = this.state.deck[slotIdx];

      // My own partial decrypt
      const myPD = await partialDecrypt(card.c1, player.keypair.secretKey);
      // Opponent's partial decrypt (computed locally — in a real game this
      // comes from on-chain events, but we have it locally for e2e)
      const oppPD = await partialDecrypt(card.c1, opponent.keypair.secretKey);

      const cardIndex = await recoverCard(card, [myPD, oppPD]);
      hand.push(cardIndex);
    }

    console.log(`  [${role.toUpperCase()}] Recovered hand:`, hand.map(cardName));
    return hand;
  }

  /**
   * Both players reveal their hand indices on-chain. Contract evaluates
   * and awards pot to winner.
   */
  async revealBothHands(
    p1Hand: number[],
    p2Hand: number[]
  ): Promise<void> {
    const p1 = this.players.get("p1")!;
    const p2 = this.players.get("p2")!;
    const gameId = this.state.gameId;

    console.log(
      "  [P1] Revealing hand:",
      p1Hand.map(cardName).join(", ")
    );
    await this.client.revealHand(
      p1.account,
      gameId,
      p1Hand as [number, number, number, number, number]
    );

    console.log(
      "  [P2] Revealing hand:",
      p2Hand.map(cardName).join(", ")
    );
    await this.client.revealHand(
      p2.account,
      gameId,
      p2Hand as [number, number, number, number, number]
    );

    this.state.phase = GamePhase.Done;
  }

  // ─── Getters ──────────────────────────────────────────────────────────

  get gameId(): string {
    return this.state.gameId;
  }

  async refreshPhase(): Promise<GamePhase> {
    this.state.phase = await this.client.getGamePhase(this.state.gameId);
    return this.state.phase;
  }

  async refreshPot(): Promise<bigint> {
    this.state.pot = await this.client.getPot(this.state.gameId);
    return this.state.pot;
  }

  getClient(): PokerContractClient {
    return this.client;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["c", "d", "h", "s"];

function cardName(idx: number): string {
  return RANKS[idx % 13] + SUITS[Math.floor(idx / 13)];
}

function formatStrk(wei: bigint): string {
  return (Number(wei) / 1e18).toFixed(2);
}
