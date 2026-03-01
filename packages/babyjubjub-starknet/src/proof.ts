import * as snarkjs from "snarkjs";
import { readFileSync } from "fs";
import { BJJPoint } from "./babyJub";

export interface PartialDecryptProofInput {
  sk: string;           // private: secret key as decimal string
  pk: [string, string]; // public: pk.x, pk.y
  c1: [string, string]; // public: c1.x, c1.y
  pd: [string, string]; // public: pd.x, pd.y
}

export interface Groth16Proof {
  proof: snarkjs.Groth16ProofData;
  publicSignals: string[];
}

// Build the circuit witness input from key material
export function buildProofInput(
  sk: bigint,
  pk: BJJPoint,
  c1: BJJPoint,
  pd: BJJPoint
): PartialDecryptProofInput {
  return {
    sk: sk.toString(),
    pk: [pk.x.toString(), pk.y.toString()],
    c1: [c1.x.toString(), c1.y.toString()],
    pd: [pd.x.toString(), pd.y.toString()],
  };
}

// Generate a Groth16 ZK proof that pd = sk*C1 and pk = sk*G
// wasmPath: path to partial_decrypt_js/partial_decrypt.wasm
// zkeyPath: path to partial_decrypt.zkey
export async function generatePartialDecryptProof(
  sk: bigint,
  pk: BJJPoint,
  c1: BJJPoint,
  pd: BJJPoint,
  wasmPath: string,
  zkeyPath: string
): Promise<Groth16Proof> {
  const input = buildProofInput(sk, pk, c1, pd);
  const start = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input as unknown as Record<string, unknown>,
    wasmPath,
    zkeyPath
  );
  const elapsed = Date.now() - start;
  // Log proof time to help benchmark for the README
  if (typeof process !== "undefined" && process.env["LOG_PROOF_TIME"]) {
    console.log(`Proof generated in ${elapsed}ms`);
  }
  return { proof, publicSignals };
}

// Verify a proof locally (used in tests; on-chain uses Cairo verifier)
export async function verifyPartialDecryptProof(
  proof: snarkjs.Groth16ProofData,
  publicSignals: string[],
  vkeyPath: string
): Promise<boolean> {
  const vkey = JSON.parse(readFileSync(vkeyPath, "utf8"));
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}
