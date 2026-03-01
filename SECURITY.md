# Security Policy

## Threat Model

StarkPoker is a cryptographic card game. This document describes what the system protects against and what it does not.

### In-scope threats (protected)

| Threat | Mitigation |
|--------|-----------|
| Player reveals opponent's cards | El Gamal threshold encryption — both secret keys needed to decrypt |
| Player lies about decryption | Groth16 ZK proof of correct partial decryption verified on-chain |
| Player steals the pot without winning | `hand_eval.cairo` determines winner deterministically; PotManager only pays proven winner |
| Player disappears after Showdown | Timeout mechanism — opponent can claim pot after 24h |
| Front-running bets | Bet amounts committed on-chain atomically with `check`/`fold` calls |

### Out-of-scope (known limitations)

| Limitation | Details |
|-----------|---------|
| Biased shuffle | No ZK proof of shuffle permutation validity. A player could submit a non-uniform shuffle. Full fix: add a shuffle argument (e.g., Bayer-Groth). |
| Key registration honesty | Players could register a key they don't know the secret for. Mitigation: require a proof of knowledge of `sk` during registration. Not yet implemented. |
| RPC node availability | The system requires a live Starknet RPC node. A down node blocks game progress but cannot steal funds. |
| Quantum adversary | Baby Jubjub / BN254 security relies on the elliptic curve discrete log problem. Not quantum-resistant. |

## Reporting a Vulnerability

Please open a GitHub issue tagged `security`. For sensitive disclosures, email the maintainer directly before public disclosure.
