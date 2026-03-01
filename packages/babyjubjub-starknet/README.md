# babyjubjub-starknet

Baby Jubjub El Gamal encryption with Starknet/Cairo serialization.
The cryptographic primitive layer for trustless mental poker (and any threshold El Gamal application) on Starknet.

[![npm version](https://badge.fury.io/js/babyjubjub-starknet.svg)](https://www.npmjs.com/package/babyjubjub-starknet)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What is this?

Baby Jubjub is a twisted Edwards elliptic curve defined over the BN254 scalar field.
Its key property: **Baby Jubjub arithmetic is native in Circom/snarkjs circuits** — both operate over the same base field, so scalar multiplications become cheap R1CS constraints.

This makes it ideal for ZK-provable threshold encryption on Starknet: players encrypt cards under an aggregate public key, partially decrypt using their secret key, and prove correctness on-chain via a Garaga-verified Groth16 proof.

**This package provides:**

- **Key generation** — Baby Jubjub keypairs for El Gamal encryption
- **Threshold El Gamal** — mask/partial-decrypt/recover for 52-card decks
- **ZK proofs** — Groth16 proof of correct partial decryption (Chaum-Pedersen)
- **Starknet calldata** — serialize all primitives for Cairo contracts (u256 encoding)
- **Deck operations** — encode 52 cards, Fisher-Yates shuffle, rerandomize

---

## Installation

```bash
npm install babyjubjub-starknet
```

**Requirements:**
- Node.js ≥ 18
- For ZK proof calldata only: Python 3.10 + `pip install garaga==1.0.1`

---

## Quick Start

```typescript
import {
  keypairFromSecret,
  computeAggregateKey,
  maskCard,
  partialDecrypt,
  recoverCard,
} from 'babyjubjub-starknet';

// Two players each generate a keypair from their secret
const alice = await keypairFromSecret(aliceSecretBigInt);
const bob   = await keypairFromSecret(bobSecretBigInt);

// Compute aggregate public key = pk_alice + pk_bob (Baby Jubjub point addition)
const apk = await computeAggregateKey([alice.publicKey, bob.publicKey]);

// Player 1 encrypts card 7 under the aggregate key
// Card index i uses (i+1)·G encoding to avoid the point-at-infinity for i=0
const masked = await maskCard(7, apk);

// Each player partially decrypts with their own secret key
const pdAlice = await partialDecrypt(masked.c1, alice.secretKey);
const pdBob   = await partialDecrypt(masked.c1, bob.secretKey);

// Recover the original card index from both partial decrypts
const cardIndex = await recoverCard(masked, [pdAlice, pdBob]);
// cardIndex === 7 ✓
```

---

## API Reference

### Types

```typescript
interface BJJPoint  { x: bigint; y: bigint; }
interface BJJKeypair { secretKey: bigint; publicKey: BJJPoint; }
interface MaskedCard { c1: BJJPoint; c2: BJJPoint; }
```

### Key Management

```typescript
// Generate a random keypair
const { secretKey, publicKey } = await generateKeypair();

// Derive a deterministic keypair from a secret bigint
const { secretKey, publicKey } = await keypairFromSecret(secret: bigint);
```

### El Gamal Threshold Encryption

```typescript
// Compute aggregate public key from an array of player public keys
const apk = await computeAggregateKey(publicKeys: BJJPoint[]);

// Scalar multiply: returns sk·G as a BJJPoint
const point = await scalarMul(scalar: bigint, base: BJJPoint);

// Add two points on Baby Jubjub
const sum = await pointAdd(a: BJJPoint, b: BJJPoint);

// Encode card index i as the point (i+1)·G
// Card 0 → 1·G, card 51 → 52·G (avoids point-at-infinity)
const cardPoint = await cardIndexToPoint(i: number);

// Encrypt a card under the aggregate public key
const masked: MaskedCard = await maskCard(cardIndex: number, apk: BJJPoint);

// Partial decryption: pd = sk · c1  (player uses their own secret key)
const pd: BJJPoint = await partialDecrypt(c1: BJJPoint, secretKey: bigint);

// Recover card index from MaskedCard + all partial decrypts
// Computes c2 - (pd1 + pd2 + ...) and finds the matching (i+1)·G
const index: number = await recoverCard(masked: MaskedCard, pds: BJJPoint[]);
```

### Deck Operations

```typescript
import { encodeDeck, shuffleDeck, rerandomizeDeck } from 'babyjubjub-starknet';

// Encode all 52 cards as masked cards (randomness r=1 — call maskCard for real games)
const deck: MaskedCard[] = await encodeDeck(apk: BJJPoint);

// Fisher-Yates shuffle + rerandomize each card, returns SHA-256 commit of ordering
const { deck: shuffled, commit: string } = await shuffleDeck(deck: MaskedCard[], apk: BJJPoint);

// Rerandomize a deck (re-mask without changing the underlying plaintext)
const rerand: MaskedCard[] = await rerandomizeDeck(deck: MaskedCard[], apk: BJJPoint);
```

### ZK Proofs

Proves `pd = sk · C1` and `pk = sk · G` without revealing `sk`.
Circuit: Chaum-Pedersen on Baby Jubjub, 4851 constraints, Groth16 on BN254.

```typescript
import { generatePartialDecryptProof, verifyPartialDecryptProof } from 'babyjubjub-starknet';

const WASM = 'path/to/circuits/partial_decrypt/build/partial_decrypt_js/partial_decrypt.wasm';
const ZKEY = 'path/to/circuits/partial_decrypt/partial_decrypt.zkey';
const VK   = 'path/to/circuits/partial_decrypt/vk.json';

const { proof, publicSignals } = await generatePartialDecryptProof(
  secretKey, publicKey, c1, pd, WASM, ZKEY
);

const valid = await verifyPartialDecryptProof(proof, publicSignals, VK);
// valid === true ✓
```

### Starknet Calldata Serialization

Baby Jubjub coordinates are BN254 Fₚ elements (~254 bits).
**Some coordinates exceed the Starknet prime** (≈ 2²⁵¹ + ...), so all points use
`u256` encoding in Cairo calldata: **4 felt252 strings per point** `[x_low, x_high, y_low, y_high]`.

```typescript
import {
  pointToFelt252,        // BJJPoint → [x_low, x_high, y_low, y_high] (4 hex strings)
  pointFromFelt252,      // (xl, xh, yl, yh) → BJJPoint  (roundtrip)
  maskedCardToCalldata,  // MaskedCard → 8 felt252 strings (2 points × 4 limbs)
  pdToCalldata,          // BJJPoint → 4 felt252 strings
  garigaProofToCalldata, // proof + publicSignals → 2005 Garaga calldata elements
  fpToU384,              // bigint → [d0, d1, d2, 0] (Garaga u384 encoding)
  u384ToFp,              // [d0, d1, d2, 0] → bigint
} from 'babyjubjub-starknet';

// Serialize public key for Cairo calldata
const [xl, xh, yl, yh] = pointToFelt252(publicKey);

// Deserialize back (roundtrip)
const recovered = pointFromFelt252(xl, xh, yl, yh);

// Serialize a partial decrypt for on-chain submission
const pdFelts = pdToCalldata(pd); // ['0x...', '0x...', '0x...', '0x...']

// Serialize a masked card
const cardFelts = maskedCardToCalldata(masked); // 8 hex strings

// Generate full Garaga calldata for verify_groth16_proof_bn254
// Requires: pip install garaga==1.0.1  (Python 3.10)
const fullProofWithHints = garigaProofToCalldata(proof, publicSignals, vkPath);
// 2005 elements:
//   [0..31]   proof (32 felt252 in u384 encoding: [d0, d1, d2, 0] per BN254 Fₚ coord)
//   [32]      number of public inputs ("6")
//   [33..44]  public signals as u256 [low128, high128] × 6
//   [45..2004] MSM hints (Garaga-specific, 1960 elements)
```

---

## Cairo Contract Integration

### Storage layout for a BJJ point

```cairo
// Each coordinate is u256 (two felt252 limbs in storage)
#[storage]
struct Storage {
    pk_x: Map<ContractAddress, u256>,
    pk_y: Map<ContractAddress, u256>,
}

// Write from TypeScript calldata [x_low, x_high, y_low, y_high]
fn store_pk(ref self: ContractState, player: ContractAddress, xl: felt252, xh: felt252, yl: felt252, yh: felt252) {
    let x = u256 { low: xl.try_into().unwrap(), high: xh.try_into().unwrap() };
    let y = u256 { low: yl.try_into().unwrap(), high: yh.try_into().unwrap() };
    self.pk_x.write(player, x);
    self.pk_y.write(player, y);
}
```

### Calling the Garaga verifier

```cairo
#[starknet::interface]
trait IGroth16VerifierBN254<TContractState> {
    fn verify_groth16_proof_bn254(
        self: @TContractState,
        full_proof_with_hints: Span<felt252>,
    ) -> Result<Span<u256>, felt252>;
}

// In your contract:
let verifier = IGroth16VerifierBN254Dispatcher { contract_address: verifier_addr };
let result = verifier.verify_groth16_proof_bn254(full_proof_with_hints);
match result {
    Result::Ok(public_inputs) => { /* proof valid — public_inputs[0..5] are the 6 signals */ },
    Result::Err(e) => { panic!("invalid proof") },
}
```

---

## Circuit Setup

The `partial_decrypt` circuit is not bundled (proving keys are large). To set up:

```bash
# 1. Compile circuit (requires circom installed via cargo)
cd circuits/partial_decrypt
circom partial_decrypt.circom --r1cs --wasm -o ./build

# 2. Generate trusted setup (ptau power 14 for 4851 constraints)
snarkjs powersoftau new bn128 14 pot14_0000.ptau
snarkjs powersoftau contribute pot14_0000.ptau pot14_0001.ptau --name="local" -e="entropy"
snarkjs powersoftau prepare phase2 pot14_0001.ptau pot14_final.ptau
snarkjs groth16 setup build/partial_decrypt.r1cs pot14_final.ptau partial_decrypt.zkey
snarkjs zkey export verificationkey partial_decrypt.zkey vk.json

# 3. Generate Cairo verifier (requires garaga==1.0.1 on Python 3.10)
garaga gen --system groth16 --vk vk.json --project-name partial_decrypt_verifier
scarb build
```

---

## Baby Jubjub Constants

```
Generator (Base8):
  x = 5299619240641551281634865583518297030282874472190772894086521144482721001553
  y = 16950150798460657717958625567821834550301663161624707787222815936182638968203

Curve order: 2736030358979909402780800718157159386076813972158567259200215660948447373041
Field (BN254 scalar): 21888242871839275222246405745257275088548364400416034343698204186575808495617
```

---

## License

MIT
