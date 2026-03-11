# ♠ StarkPoker

**Trustless 5-card draw poker on Starknet — no server, no dealer, no trust.**

Cards are encrypted with Baby Jubjub El Gamal. Decryption is proven with Groth16 ZK proofs verified on-chain by a Garaga verifier. Every shuffle, every reveal, every pot settlement is cryptographically guaranteed.

[![Live on Sepolia](https://img.shields.io/badge/live%20demo-starkpoker.vercel.app-brightgreen)](https://starkpoker.vercel.app)
[![Contract](https://img.shields.io/badge/Sepolia%20contract-0x0006005f-blue)](https://sepolia.starkscan.co/contract/0x0006005f4adc7ceffeb86779ceedc89855ee5cb24f3841fa3dfe6a8d66059208)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## The Problem

Traditional online poker requires trusting a server to shuffle and deal fairly. That server is a single point of failure — it can be hacked, rigged, or censored. Even "provably fair" systems require trusting a seed or a random oracle.

**Mental poker** eliminates the trusted dealer entirely. Players shuffle the deck *together*, with cryptographic guarantees that neither player can see the other's cards or bias the shuffle.

StarkPoker brings this 40-year-old cryptographic idea to life on Starknet — with ZK proofs verified on-chain.

---

## How It Works

```
Create Game → Register Keys → Double Shuffle → Bet → Showdown → Settle
```

### 1. Threshold Encryption (Baby Jubjub El Gamal)

Each card is encrypted as a Baby Jubjub elliptic curve point under an **aggregate public key** `APK = pk₁ + pk₂`. Neither player's key alone can decrypt — both partial decryptions are required.

```
Card i  →  M = (i+1)·G
Encrypt →  (c₁, c₂) = (r·G,  M + r·APK)
Partial →  pdᵢ = skᵢ · c₁
Recover →  M = c₂ - pd₁ - pd₂
```

### 2. Double Shuffle (Barnett-Smart Protocol)

1. **P1** encrypts all 52 cards under APK and shuffles with a secret permutation
2. **P2** re-randomises each ciphertext (changing the cyphertext but not the plaintext) and shuffles again

After both shuffles, neither player can map deck positions to card values. The final order is `π₂(π₁(identity))` — unknown to both.

### 3. ZK-Proven Decryption

At showdown, each player proves they computed `pd = sk·c₁` correctly **without revealing their secret key**. The Groth16 proof is verified on-chain by a [Garaga](https://github.com/keep-starknet-strange/garaga)-generated Cairo verifier.

**Circuit constraints:** `pd = sk·c₁` AND `pk = sk·G` (Chaum-Pedersen)

### 4. On-Chain Settlement

`hand_eval.cairo` evaluates both 5-card hands. `pot_manager.cairo` transfers the STRK pot to the winner. No off-chain coordination needed for settlement.

---

## Live Demo

**Play now:** [starkpoker.vercel.app](https://starkpoker.vercel.app)

Requires: ArgentX or Braavos wallet connected to **Starknet Sepolia**

**Contract:** [`0x0006005f...`](https://sepolia.starkscan.co/contract/0x0006005f4adc7ceffeb86779ceedc89855ee5cb24f3841fa3dfe6a8d66059208) on Sepolia

The demo has been played end-to-end on Sepolia with two real wallets. The complete flow — key registration, double shuffle, betting, showdown, and STRK settlement — executes trustlessly on-chain.

---

## Architecture

```
starkpoker/
├── contracts/                   # Cairo smart contracts (Scarb 2.14)
│   └── src/
│       ├── poker_game.cairo     # 6-phase state machine
│       ├── hand_eval.cairo      # 5-card hand evaluator (rank 0–8)
│       └── pot_manager.cairo    # STRK escrow & settlement
│
├── packages/
│   └── babyjubjub-starknet/    # npm library: Baby Jubjub El Gamal for Starknet
│       └── src/
│           ├── keypair.ts       # generateKeypair, keypairFromSecret
│           ├── elgamal.ts       # maskCard, partialDecrypt, recoverCard
│           └── deck.ts          # encodeDeck, shuffleDeck, rerandomizeDeck
│
├── circuits/partial_decrypt/    # Circom 2 ZK circuit (Groth16/BN254)
│   ├── partial_decrypt.circom   # 4,851 non-linear constraints
│   └── vk.json                  # Verification key
│
├── sdk/                         # TypeScript SDK + automation scripts
│   └── src/starknet.ts          # PokerContractClient
│
└── frontend/                    # Next.js 16 + Tailwind + starknet-react v5
    └── src/
        ├── components/
        │   ├── Card.tsx         # CSS 3D flip card animation
        │   ├── GameTable.tsx    # In-game UI with live hand display
        │   └── ProofStatus.tsx  # ZK proof progress indicator
        └── lib/usePokerGame.ts  # Core game state hook
```

---

## Cairo Contracts

### `poker_game.cairo` — State Machine

| Phase | Enum | Description |
|-------|------|-------------|
| 0 | `WaitingForPlayer2` | P1 locked ante; awaiting P2 |
| 1 | `RegisteringKeys` | Both players register Baby Jubjub public keys |
| 2 | `Shuffling` | P1 submits masked deck; P2 re-randomises & shuffles |
| 3 | `Playing` | Betting: check or fold |
| 4 | `Showdown` | Both players reveal card indices on-chain |
| 5 | `Done` | Hand evaluated; STRK transferred to winner |

Key entry points: `create_game`, `join_game`, `register_public_key`, `submit_masked_deck`, `submit_shuffle`, `check_action`, `fold`, `reveal_hand`

### `hand_eval.cairo` — Pure Cairo Evaluator

Evaluates any 5-card hand and returns a comparable score:

```
Straight Flush (8) > Four of a Kind (7) > Full House (6) > Flush (5) >
Straight (4) > Three of a Kind (3) > Two Pair (2) > Pair (1) > High Card (0)
```

Score formula: `rank × 10_000 + kicker × 100 + sum_of_ranks`

---

## `babyjubjub-starknet` npm Library

A standalone TypeScript library for Baby Jubjub El Gamal encryption with Starknet/Cairo serialization.

```typescript
import {
  generateKeypair,
  computeAggregateKey,
  maskCard,
  partialDecrypt,
  recoverCard,
  rerandomizeDeck,
} from "babyjubjub-starknet";

// Two-player threshold encryption
const kp1 = await generateKeypair();
const kp2 = await generateKeypair();
const apk = await computeAggregateKey(kp1.publicKey, kp2.publicKey);

// Encrypt card 7 under aggregate key
const masked = await maskCard(7, apk);

// Each player computes partial decryption
const pd1 = await partialDecrypt(masked.c1, kp1.secretKey);
const pd2 = await partialDecrypt(masked.c1, kp2.secretKey);

// Recover original card index
const cardIdx = await recoverCard(masked, pd1, pd2); // → 7
```

**16/16 unit tests passing.** Published to npm: `babyjubjub-starknet`

---

## Security Model

| Guarantee | Mechanism |
|-----------|-----------|
| Cards are hidden from opponents | Baby Jubjub El Gamal threshold encryption |
| No player can peek at another's cards | Aggregate key: decryption requires both partial secrets |
| Decryption is proven correct | Groth16 ZK proof verified on-chain (Garaga) |
| Shuffle is secret | Double permutation: final order unknown to both players |
| Settlement is automatic | `hand_eval.cairo` + `pot_manager.cairo` — no off-chain step |
| Abandonment protection | `claim_timeout` lets opponent claim pot after 1 hour of inactivity |

**Current limitations:** Shuffle permutation is not ZK-proven (future work: shuffle argument). Card validity is enforced by `hand_eval` at settle time.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart contracts | Cairo (Scarb 2.14), Starknet Sepolia |
| ZK circuit | Circom 2, snarkjs, Groth16/BN254 |
| On-chain verifier | [Garaga](https://github.com/keep-starknet-strange/garaga) 1.0.1 |
| Curve arithmetic | Baby Jubjub via [circomlibjs](https://github.com/iden3/circomlibjs) |
| SDK | TypeScript, starknet.js v9 |
| Frontend | Next.js 16, Tailwind CSS, starknet-react v5 |
| Wallet | ArgentX / Braavos |
| Deploy | Vercel (Sepolia) |

---

## Local Development

```bash
# Install
npm install
cd frontend && npm install

# Run frontend
cd frontend && npm run dev

# Build contracts
cd contracts && scarb build

# Run SDK scripts (requires env vars)
cd sdk && npx ts-node scripts/p2-autoplay.ts
```

### Deployed Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| PokerGame | [`0x0006005f4adc7ceffeb86779ceedc89855ee5cb24f3841fa3dfe6a8d66059208`](https://sepolia.starkscan.co/contract/0x0006005f4adc7ceffeb86779ceedc89855ee5cb24f3841fa3dfe6a8d66059208) |
| STRK Token | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |

---

## References

- Shamir, Rivest, Adleman — [*Mental Poker*](https://people.csail.mit.edu/rivest/pubs/SRA81.pdf) (1981)
- Barnett & Smart — [*Mental Poker Revisited*](https://link.springer.com/chapter/10.1007/978-3-540-40974-8_19) (2003)
- [EIP-2494 — Baby Jubjub specification](https://eips.ethereum.org/EIPS/eip-2494)
- [Garaga — Starknet SNARK verifier generator](https://github.com/keep-starknet-strange/garaga)

---

## License

MIT
