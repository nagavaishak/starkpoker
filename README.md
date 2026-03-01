# ♠ StarkPoker — Trustless Mental Poker on Starknet

> **5-card draw poker where no one — not even the server — ever sees your cards.**
> Cards are encrypted with Baby Jubjub El Gamal. Decryption is proven with Groth16 ZK proofs verified on-chain by a Garaga verifier. Every shuffle, every reveal, every pot settlement is trustless and auditable on Starknet.

[![Live Demo](https://img.shields.io/badge/live-frontend--nagavaishak--belay.vercel.app-green)](https://frontend-nagavaishak-belay.vercel.app)
[![Demo Mode](https://img.shields.io/badge/demo-no%20wallet%20required-yellow)](https://frontend-nagavaishak-belay.vercel.app/demo)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Table of Contents

1. [What is Mental Poker?](#what-is-mental-poker)
2. [How StarkPoker Works](#how-starkpoker-works)
3. [Architecture](#architecture)
4. [Cryptographic Protocol](#cryptographic-protocol)
5. [ZK Circuit](#zk-circuit)
6. [Smart Contracts (Cairo)](#smart-contracts-cairo)
7. [SDK](#sdk)
8. [Frontend](#frontend)
9. [Local Development](#local-development)
10. [Running the Demo](#running-the-demo)
11. [Security Model](#security-model)
12. [Tech Stack](#tech-stack)

---

## What is Mental Poker?

Mental poker is a cryptographic technique that allows multiple parties to play a fair card game **without a trusted dealer or server**. First described by Adi Shamir, Ron Rivest, and Leonard Adleman (the RSA inventors) in 1979, the core challenge is:

> *"How can Alice and Bob play poker over the phone, with no third party, where neither can cheat?"*

The classic solution involves commutative encryption: both players encrypt the deck, then reveal cards by decrypting their own layer. StarkPoker modernises this using:

- **Baby Jubjub El Gamal** — elliptic curve encryption compatible with SNARK proving
- **Groth16 ZK proofs** — prove correct decryption without revealing the secret key
- **Garaga verifier on Starknet** — on-chain proof verification in Cairo

---

## How StarkPoker Works

A full game proceeds through these phases:

```
WaitingForPlayer2 → RegisteringKeys → Shuffling → Playing → Showdown → Done
```

### Phase-by-phase breakdown

| Phase | What Happens |
|-------|-------------|
| **Create / Join** | P1 calls `create_game` locking the ante in STRK. P2 calls `join_game` matching it. Pot = 2× ante. |
| **Register Keys** | Both players generate Baby Jubjub keypairs off-chain. They compute an **aggregate public key** `APK = pk1 + pk2` (EC point addition). Each player registers their public key on-chain. |
| **Shuffle** | P1 encrypts all 52 cards under APK (`maskCard`), then shuffles the array. Submits the masked deck on-chain. P2 re-randomises each ciphertext (`rerandomizeDeck`) and shuffles again. Submits the final deck on-chain. |
| **Playing** | Players bet, check, or fold. STRK pot is managed by the `PotManager` contract. |
| **Showdown** | Each player computes partial decryptions of their 5 card slots using their secret key. Combined partial decryptions recover the original card index (`recoverCard`). Cards are revealed on-chain and the winner is determined by `hand_eval.cairo`. |
| **Settle** | `PotManager` transfers STRK to the winner. Loser's stake is slashed if they timed out. |

---

## Architecture

```
starkpoker/
├── contracts/                  # Cairo smart contracts
│   └── src/
│       ├── poker_game.cairo    # Main state machine
│       ├── hand_eval.cairo     # 5-card hand evaluator
│       └── pot_manager.cairo   # STRK escrow & settlement
│
├── packages/
│   ├── babyjubjub-starknet/    # Baby Jubjub El Gamal library (TypeScript)
│   │   └── src/
│   │       ├── babyJub.ts      # Curve arithmetic (via circomlibjs)
│   │       ├── keypair.ts      # Key generation
│   │       ├── elgamal.ts      # Encrypt / partial-decrypt / recover
│   │       └── deck.ts         # Shuffle / rerandomise
│   │
│   └── zk-shuffle-starknet/    # Groth16 circuit + prover (Circom/snarkjs)
│
├── sdk/                        # TypeScript SDK for dApp integration
│   └── src/
│       └── starknet.ts         # PokerContractClient (RPC + write methods)
│
└── frontend/                   # Next.js 16 + Tailwind + starknet-react v5
    └── src/
        ├── app/
        │   ├── page.tsx        # Lobby (wallet connect, create/join)
        │   └── demo/page.tsx   # Scripted devnet demo (no wallet needed)
        ├── components/
        │   ├── Card.tsx        # 3D flip card animation
        │   ├── GameTable.tsx   # In-game UI
        │   ├── ProofStatus.tsx # ZK proof progress indicator
        │   └── WalletConnect.tsx
        ├── lib/
        │   └── usePokerGame.ts # Core game hook
        └── poker/              # Browser-safe crypto (vendored)
            ├── babyJub.ts
            ├── elgamal.ts
            ├── deck.ts
            └── keypair.ts
```

---

## Cryptographic Protocol

### Baby Jubjub Elliptic Curve

Baby Jubjub is a twisted Edwards curve defined over the scalar field of BN254. It is SNARK-friendly — arithmetic on it can be expressed efficiently inside a Groth16 circuit.

**Curve parameters:**
```
a = 168700
d = 168696
Order = 2736030358979909402780800718157159386076813972158567259200215660948447373041
Generator G = (Gx, Gy)
```

### El Gamal Encryption

Each card `i ∈ {0..51}` is encrypted as a Baby Jubjub point:

```
plaintext point: M = i·G + H   (H is an independent generator)

keypair: sk ∈ Fq,  pk = sk·G

encrypt(M, pk, r):
  c1 = r·G
  c2 = M + r·pk
  return (c1, c2)

decrypt(c1, c2, sk):
  M = c2 - sk·c1
```

### Aggregate Key & Threshold Decryption

With two players, neither player alone can decrypt a card. The aggregate key `APK = pk1 + pk2` is used to encrypt all cards. Decryption requires both players' participation:

```
partial_decrypt(c1, sk_i):
  pd_i = sk_i · c1

recover(c1, c2, pd1, pd2):
  M = c2 - pd1 - pd2   # = c2 - sk1·c1 - sk2·c1 = c2 - (sk1+sk2)·c1
```

Since `sk1+sk2` = effective aggregate secret key (by linearity of scalar multiplication), neither player can decrypt alone.

### Double Shuffle (Barnett-Smart Protocol)

1. P1 encrypts card `i` under APK: `(r_i·G, card_i + r_i·APK)` for random `r_i`
2. P1 shuffles the array with a secret permutation `π1`
3. P2 **re-randomises** each ciphertext by adding a fresh random term:
   `(c1 + r'·G, c2 + r'·APK)` — changes the ciphertext but not the plaintext
4. P2 shuffles with secret permutation `π2`

After both shuffles, neither player knows the correspondence between deck positions and card values. The final mapping is `π2(π1(identity))` — unknown to both parties.

---

## ZK Circuit

The `zk-shuffle-starknet` package contains a **Circom** circuit that proves:

> *"I computed `pd = sk·c1` correctly for my secret key `sk`, without revealing `sk`."*

**Public inputs:**
- `c1` — the first ciphertext component (EC point)
- `pd` — the claimed partial decryption (EC point)
- `pk` — the player's public key

**Private input:**
- `sk` — the player's secret key

**Constraint:** `pd = sk·c1` AND `pk = sk·G`

The proof is Groth16 (BN254). The verifier is generated by **Garaga** (`garaga gen`) and deployed as a Cairo contract. On-chain verification happens inside `submit_partial_decrypt`.

---

## Smart Contracts (Cairo)

### `poker_game.cairo`

The main contract implementing the 6-phase state machine.

**Key entry points:**

| Function | Description |
|----------|-------------|
| `create_game(ante)` | Lock ante in STRK, emit `GameCreated(game_id, player1)` |
| `join_game(game_id)` | Lock matching ante, advance to `RegisteringKeys` |
| `register_public_key(game_id, pk_x, pk_y)` | Store player's Baby Jubjub public key |
| `submit_masked_deck(game_id, deck)` | P1 submits 52 El Gamal ciphertexts |
| `submit_shuffle(game_id, deck)` | P2 submits re-randomised + shuffled deck |
| `check(game_id)` | Advance betting; both check → Showdown |
| `fold(game_id)` | Forfeit; opponent wins the pot |
| `reveal_hand(game_id, cards)` | Reveal 5 card indices at Showdown |
| `settle(game_id)` | Evaluate hands, pay winner via PotManager |

### `hand_eval.cairo`

Pure Cairo function that evaluates a 5-card hand and returns a numeric score:

```
Straight Flush > Four of a Kind > Full House > Flush >
Straight > Three of a Kind > Two Pair > Pair > High Card
```

Score formula: `rank×10000 + high_card×100 + sum_of_ranks`

### `pot_manager.cairo`

STRK escrow contract. Holds funds in `game_id → amount` mapping. Winner withdraws via `settle`.

---

## SDK

`sdk/src/starknet.ts` — `PokerContractClient` wraps all contract interactions.

```typescript
import { PokerContractClient, buildAccount } from "starkpoker-sdk";

const client = new PokerContractClient("http://localhost:5050", {
  gameAddress: "0x...",
  strkAddress:  "0x...",
});

const account = buildAccount(rpcUrl, address, privateKey);

// Full game flow
const gameId = await client.createGame(account, 1_000_000_000_000_000_000n); // 1 STRK
await client.joinGame(account2, gameId);
await client.registerPublicKey(account, gameId, pk.x, pk.y);
await client.submitMaskedDeck(account, gameId, deckCalldata);
await client.submitShuffle(account2, gameId, shuffledCalldata);
await client.checkAction(account, gameId);
await client.revealHand(account, gameId, [card0, card1, card2, card3, card4]);
```

---

## Frontend

Built with **Next.js 16**, **Tailwind CSS**, and **starknet-react v5**.

### Pages

| Route | Description |
|-------|-------------|
| `/` | Lobby — connect wallet, create or join a game |
| `/demo` | Scripted demo — runs a full game against devnet with no wallet required |

### Key components

- **`Card.tsx`** — CSS 3D flip animation with staggered deal delay (120ms per card)
- **`ProofStatus.tsx`** — Live elapsed-time indicator during crypto operations
- **`GameTable.tsx`** — In-game layout with opponent hand (face-down), your hand, and action buttons
- **`usePokerGame.ts`** — Central game hook; lazy-loads crypto via `import()` to keep initial bundle small

---

## Local Development

### Prerequisites

```bash
node >= 18
npm >= 9
scarb >= 2.6          # Cairo compiler
starknet-devnet       # Local Starknet node
```

### 1. Install dependencies

```bash
git clone https://github.com/your-org/starkpoker
cd starkpoker
npm install
cd frontend && npm install
```

### 2. Start devnet

```bash
starknet-devnet --seed 42 --port 5050
```

`--seed 42` deterministically generates the two pre-funded accounts used by the demo.

### 3. Deploy contracts

```bash
cd contracts
scarb build
# deploy script (uses account from seed 42)
npx ts-node sdk/scripts/deploy.ts
```

### 4. Run the full e2e test

```bash
npx ts-node sdk/scripts/e2e-integration.ts
# Expected: 14/14 assertions passing
```

### 5. Start the frontend

```bash
cd frontend
npm run dev
# open http://localhost:3000
```

---

## Running the Demo

The `/demo` page runs a complete trustless poker game in your browser — no wallet extension required.

**Requirements:** `starknet-devnet` running locally with `--seed 42`.

```
starknet-devnet --seed 42 --port 5050
```

Then visit: `http://localhost:3000/demo` (or the [live Vercel deployment](https://frontend-nagavaishak-belay.vercel.app/demo)).

### What the demo does (step by step)

1. **Player 1 creates a game** — locks 1 STRK ante
2. **Player 2 joins** — matches the ante; pot = 2 STRK
3. **Keypair generation** — both players generate Baby Jubjub keypairs; aggregate key computed
4. **P1 masks 52 cards** — each card encrypted under APK; deck shuffled
5. **P2 rerandomises & shuffles** — second shuffle; final deck committed on-chain
6. **Both players check** — advance to Showdown
7. **Partial decryption** — both players compute `sk·c1` for their 5 card slots
8. **Card recovery** — card indices recovered from combined partial decryptions
9. **Reveal on-chain** — both hands submitted; winner determined by `hand_eval`
10. **Pot settled** — winner receives 2 STRK

The demo logs every step in real time, including cryptographic operation timing.

---

## Security Model

### What the ZK proofs guarantee

- **Correct decryption:** Each player proves `pd = sk·c1` without revealing `sk`. You cannot claim a card that was encrypted to someone else's key.
- **Key binding:** The proof also checks `pk = sk·G`, so the secret key used for decryption matches the public key registered on-chain.

### What is NOT proven (current scope)

- **Shuffle correctness:** The current implementation does not prove that the shuffle is a valid permutation. A malicious player could submit a non-permutation deck. A full implementation would add a shuffle ZK proof (e.g., using a permutation argument). This is left as future work.
- **Card validity:** The circuit does not prove that decrypted points correspond to valid card indices 0–51. Malicious cards would fail the on-chain `hand_eval` check.

### Trust assumptions

| Component | Trust required |
|-----------|---------------|
| On-chain contracts | None — open source, deterministic Cairo |
| ZK verifier (Garaga) | None — Groth16 proof mathematically verified |
| RPC node | Liveness only — cannot forge state |
| Players | Neither player can cheat on decryption (ZK proven) |
| Shuffle | Players could shuffle non-uniformly (no shuffle proof yet) |

### Timeout mechanism

If a player goes offline during Showdown, the opponent can call `claim_timeout` after a configurable window (default: 24 hours) to claim the pot.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart contracts | Cairo (Scarb), Starknet |
| ZK circuit | Circom 2, snarkjs, Groth16/BN254 |
| On-chain verifier | [Garaga](https://github.com/keep-starknet-strange/garaga) |
| Curve arithmetic | Baby Jubjub (via [circomlibjs](https://github.com/iden3/circomlibjs)) |
| SDK | TypeScript, starknet.js v9 |
| Frontend | Next.js 16, Tailwind CSS, starknet-react v5 |
| Wallet | ArgentX / Braavos |
| Deploy | Vercel |
| Local devnet | [starknet-devnet-rs](https://github.com/0xSpaceShard/starknet-devnet-rs) |

---

## References

- Shamir, Rivest, Adleman — [*Mental Poker*](https://people.csail.mit.edu/rivest/pubs/SRA81.pdf) (1981)
- Barnett & Smart — [*Mental Poker Revisited*](https://link.springer.com/chapter/10.1007/978-3-540-40974-8_19) (2003)
- [Baby Jubjub specification](https://eips.ethereum.org/EIPS/eip-2494) — EIP-2494
- [Garaga — Starknet SNARK verifier generator](https://github.com/keep-starknet-strange/garaga)
- [circomlibjs](https://github.com/iden3/circomlibjs) — Baby Jubjub JavaScript implementation

---

## License

MIT — see [LICENSE](LICENSE) for details.
