import { join } from "path";
import { keypairFromSecret } from "../src/keypair";
import { maskCard, partialDecrypt } from "../src/elgamal";
import {
  pointToFelt252,
  pointFromFelt252,
  maskedCardToCalldata,
  pdToCalldata,
  garigaProofToCalldata,
  fpToU384,
  u384ToFp,
} from "../src/calldata";
import { generatePartialDecryptProof, verifyPartialDecryptProof } from "../src/proof";

const CIRCUIT_DIR = join(__dirname, "../../../circuits/partial_decrypt");
const WASM = join(CIRCUIT_DIR, "build/partial_decrypt_js/partial_decrypt.wasm");
const ZKEY = join(CIRCUIT_DIR, "partial_decrypt.zkey");
const VK   = join(CIRCUIT_DIR, "vk.json");

describe("calldata serialization", () => {
  test("pointToFelt252 + pointFromFelt252 roundtrip (u256 encoding)", async () => {
    const { publicKey } = await keypairFromSecret(12345678901234567890123456789n);
    // Returns [x_low, x_high, y_low, y_high] — 4 felt252 limbs for u256 storage
    const [xl, xh, yl, yh] = pointToFelt252(publicKey);
    for (const v of [xl, xh, yl, yh]) {
      expect(v).toMatch(/^0x[0-9a-f]*$/);
    }
    // Roundtrip via pointFromFelt252
    const recovered = pointFromFelt252(xl, xh, yl, yh);
    expect(recovered.x).toBe(publicKey.x);
    expect(recovered.y).toBe(publicKey.y);
  });

  test("maskedCardToCalldata produces 8-element array (u256 per coord × 4 coords)", async () => {
    const { publicKey } = await keypairFromSecret(99999n);
    const masked = await maskCard(5, publicKey);
    const calldata = maskedCardToCalldata(masked);
    // 2 points × 2 coords × 2 limbs = 8 felt252 strings
    expect(calldata).toHaveLength(8);
    for (const v of calldata) {
      expect(v).toMatch(/^0x[0-9a-f]*$/);
    }
    // Roundtrip: decode first point (c1)
    const c1Recovered = pointFromFelt252(calldata[0], calldata[1], calldata[2], calldata[3]);
    expect(c1Recovered.x).toBe(masked.c1.x);
    expect(c1Recovered.y).toBe(masked.c1.y);
  });

  test("pdToCalldata produces 4-element array (u256 encoding for Cairo u256 storage)", async () => {
    const { secretKey, publicKey } = await keypairFromSecret(77777n);
    const masked = await maskCard(3, publicKey);
    const pd = await partialDecrypt(masked.c1, secretKey);
    const calldata = pdToCalldata(pd);
    // x_low, x_high, y_low, y_high
    expect(calldata).toHaveLength(4);
    for (const v of calldata) {
      expect(v).toMatch(/^0x[0-9a-f]*$/);
    }
  });

  test("fpToU384 + u384ToFp roundtrip for BN254 field elements", () => {
    const testValues = [
      0n,
      1n,
      (1n << 96n) - 1n,
      (1n << 96n),
      (1n << 192n) - 1n,
      21888242871839275222246405745257275088548364400416034343698204186575808495617n,
    ];
    for (const v of testValues) {
      const encoded = fpToU384(v);
      expect(encoded[3]).toBe(0n);
      expect(u384ToFp(encoded)).toBe(v);
    }
  });

  test("garigaProofToCalldata produces 2005-element array (32 proof + 1 + 12 pub + 1960 hints)", async () => {
    const { secretKey, publicKey } = await keypairFromSecret(12345678901234567890123456789n);
    const r = 55555555555555555555555555555n;
    const { getBabyJub, rawToPoint } = await import("../src/babyJub");
    const babyJub = await getBabyJub();
    const c1Raw = babyJub.mulPointEscalar(babyJub.Base8, r);
    const pdRaw = babyJub.mulPointEscalar(c1Raw, secretKey);
    const c1 = rawToPoint(babyJub, c1Raw);
    const pd = rawToPoint(babyJub, pdRaw);

    const { proof, publicSignals } = await generatePartialDecryptProof(
      secretKey, publicKey, c1, pd, WASM, ZKEY
    );
    const calldata = garigaProofToCalldata(proof, publicSignals, VK);

    expect(calldata).toHaveLength(2005);
    // Index 32 = number of public inputs = 6
    expect(calldata[32]).toBe("6");
    // All elements parseable as BigInt
    for (const v of calldata) {
      expect(() => BigInt(v)).not.toThrow();
    }
  }, 60000);
});

describe("proof generation + verification", () => {
  test("generatePartialDecryptProof produces valid proof (snarkjs local verify)", async () => {
    const { secretKey, publicKey } = await keypairFromSecret(12345678901234567890123456789n);
    const r = 55555555555555555555555555555n;
    const { getBabyJub, rawToPoint } = await import("../src/babyJub");
    const babyJub = await getBabyJub();
    const c1Raw = babyJub.mulPointEscalar(babyJub.Base8, r);
    const pdRaw = babyJub.mulPointEscalar(c1Raw, secretKey);
    const c1 = rawToPoint(babyJub, c1Raw);
    const pd = rawToPoint(babyJub, pdRaw);

    const { proof, publicSignals } = await generatePartialDecryptProof(
      secretKey, publicKey, c1, pd, WASM, ZKEY
    );
    const valid = await verifyPartialDecryptProof(proof, publicSignals, VK);
    expect(valid).toBe(true);
  }, 30000);
});
