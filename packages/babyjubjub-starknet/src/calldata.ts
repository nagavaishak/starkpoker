/**
 * Starknet serialization layer for Baby Jubjub El Gamal.
 *
 * Key insight from reverse-engineering Garaga 1.0.1 calldata format:
 *   - Groth16 BN254 proof is encoded as 32 felt252s (u384 encoding: each Fp element
 *     split into [d0, d1, d2, 0] where value = d0 + d1*2^96 + d2*2^192)
 *   - Followed by public input count, then public signals as u256 [low128, high128]
 *   - Followed by 1960 MSM hints (computed by Garaga's Python algorithm)
 *
 * The MSM hints cannot be reproduced in pure TypeScript without reimplementing Garaga.
 * garigaProofToCalldata() shells out to the garaga CLI (pip install garaga==1.0.1).
 */

import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { BJJPoint } from "./babyJub";
import { MaskedCard } from "./elgamal";
import { Groth16ProofData } from "snarkjs";

const MASK128 = (1n << 128n) - 1n;

// ─── Basic serialization ───────────────────────────────────────────────────
// BJJPoint coordinates are BN254 Fp elements (~254 bits).
// Some exceed the Starknet prime (252 bits), so Cairo storage uses u256.
// Cairo u256 in calldata = two felt252 limbs: [low128, high128].

// Encode a single coordinate (bigint) as [low128_hex, high128_hex]
function coordToU256(v: bigint): [string, string] {
  return [`0x${(v & MASK128).toString(16)}`, `0x${(v >> 128n).toString(16)}`];
}

// Serialize a BJJPoint for Cairo u256 storage: [x_low, x_high, y_low, y_high]
// pointToFelt252 is a slight misnomer kept for API compatibility —
// each coordinate is split into two felt252 limbs (u256 encoding).
export function pointToFelt252(point: BJJPoint): [string, string, string, string] {
  const [xl, xh] = coordToU256(point.x);
  const [yl, yh] = coordToU256(point.y);
  return [xl, xh, yl, yh];
}

// Deserialize a BJJPoint from u256-encoded calldata strings (2 per coordinate)
export function pointFromFelt252(xl: string, xh: string, yl: string, yh: string): BJJPoint {
  return {
    x: BigInt(xl) + BigInt(xh) * (1n << 128n),
    y: BigInt(yl) + BigInt(yh) * (1n << 128n),
  };
}

// Serialize a MaskedCard as 8 felt252 strings (u256 per coordinate × 4 coords)
// Layout: [c1.x_low, c1.x_high, c1.y_low, c1.y_high, c2.x_low, c2.x_high, c2.y_low, c2.y_high]
export function maskedCardToCalldata(card: MaskedCard): string[] {
  return [...pointToFelt252(card.c1), ...pointToFelt252(card.c2)];
}

// Serialize a partial decrypt point as 4 felt252 strings (u256 encoding)
export function pdToCalldata(pd: BJJPoint): string[] {
  return [...pointToFelt252(pd)];
}

// ─── Garaga proof calldata ─────────────────────────────────────────────────

/**
 * Convert a snarkjs Groth16 proof + public signals into Garaga-format felt252
 * calldata for the Cairo `verify_groth16_proof_bn254` function.
 *
 * Format (2005 elements for partial_decrypt circuit with 6 public inputs):
 *   [0..31]   proof: π_A (8) + π_B (16) + π_C (8), each coord as u384 [d0,d1,d2,0]
 *   [32]      number of public inputs (6)
 *   [33..44]  public signals as u256: [low128, high128] × 6
 *   [45..2004] MSM hints (computed by Garaga, 1960 elements)
 *
 * Requires: garaga CLI installed (`pip install garaga==1.0.1` with Python 3.10)
 * vkPath: absolute path to vk.json (the verification key from snarkjs)
 */
export function garigaProofToCalldata(
  proof: Groth16ProofData,
  publicSignals: string[],
  vkPath: string
): string[] {
  const dir = tmpdir();
  const ts = Date.now();
  const proofPath = join(dir, `garaga_proof_${ts}.json`);
  const pubPath = join(dir, `garaga_pub_${ts}.json`);

  try {
    writeFileSync(proofPath, JSON.stringify(proof));
    writeFileSync(pubPath, JSON.stringify(publicSignals));

    const raw = execFileSync(
      "garaga",
      [
        "calldata",
        "--system", "groth16",
        "--vk", vkPath,
        "--proof", proofPath,
        "--public-inputs", pubPath,
        "--format", "array",
      ],
      { encoding: "utf8" }
    ).trim();

    // Strip brackets, split on commas, trim whitespace
    return raw
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      throw new Error(
        "garaga CLI not found. Install with: pip install garaga==1.0.1 (Python 3.10 required)"
      );
    }
    throw err;
  } finally {
    try { unlinkSync(proofPath); } catch { /* ignore */ }
    try { unlinkSync(pubPath); } catch { /* ignore */ }
  }
}

// ─── u384 encoding (internal — exposed for testing) ───────────────────────

// Encode a BN254 Fp element as Garaga's u384 = [d0, d1, d2, 0]
// value = d0 + d1*2^96 + d2*2^192, all limbs fit in felt252
export function fpToU384(x: bigint): [bigint, bigint, bigint, bigint] {
  const MASK96 = (1n << 96n) - 1n;
  return [x & MASK96, (x >> 96n) & MASK96, (x >> 192n) & MASK96, 0n];
}

// Decode a u384 back to a bigint
export function u384ToFp(d: [bigint, bigint, bigint, bigint]): bigint {
  return d[0] + d[1] * (1n << 96n) + d[2] * (1n << 192n);
}
