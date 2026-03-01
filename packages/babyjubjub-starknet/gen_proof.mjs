// Generates a real partial_decrypt proof and saves proof.json + public.json
// Run: node /tmp/gen_proof.mjs
import { buildBabyjub } from "circomlibjs";
import * as snarkjs from "snarkjs";
import { writeFileSync } from "fs";

const CIRCUIT_DIR = "/Users/shashank/Desktop/Hackathon projects/starkpoker/circuits/partial_decrypt";
const WASM = `${CIRCUIT_DIR}/build/partial_decrypt_js/partial_decrypt.wasm`;
const ZKEY = `${CIRCUIT_DIR}/partial_decrypt.zkey`;
const OUT_PROOF = `${CIRCUIT_DIR}/proof.json`;
const OUT_PUBLIC = `${CIRCUIT_DIR}/public.json`;

const babyJub = await buildBabyjub();
const F = babyJub.F;

const sk = 12345678901234567890123456789n;
const pk = babyJub.mulPointEscalar(babyJub.Base8, sk);
const r  = 55555555555555555555555555555n;
const c1 = babyJub.mulPointEscalar(babyJub.Base8, r);
const pd = babyJub.mulPointEscalar(c1, sk);

const input = {
  sk: sk.toString(),
  pk: [F.toString(pk[0]), F.toString(pk[1])],
  c1: [F.toString(c1[0]), F.toString(c1[1])],
  pd: [F.toString(pd[0]), F.toString(pd[1])],
};

console.log("Generating proof...");
const t0 = Date.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
console.log(`Proof generated in ${Date.now() - t0}ms`);

writeFileSync(OUT_PROOF, JSON.stringify(proof, null, 2));
writeFileSync(OUT_PUBLIC, JSON.stringify(publicSignals, null, 2));
console.log("proof.json and public.json written to", CIRCUIT_DIR);
console.log("publicSignals:", publicSignals);
