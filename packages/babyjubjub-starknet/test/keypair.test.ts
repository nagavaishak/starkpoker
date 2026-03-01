import { generateKeypair, keypairFromSecret } from "../src/keypair";
import { getBabyJub } from "../src/babyJub";

describe("keypair", () => {
  test("generateKeypair returns valid Baby Jubjub point", async () => {
    const { secretKey, publicKey } = await generateKeypair();
    expect(secretKey).toBeGreaterThan(0n);
    // Verify pk = sk * G by recomputing
    const babyJub = await getBabyJub();
    const expected = babyJub.mulPointEscalar(babyJub.Base8, secretKey);
    expect(publicKey.x).toBe(BigInt(babyJub.F.toString(expected[0])));
    expect(publicKey.y).toBe(BigInt(babyJub.F.toString(expected[1])));
  });

  test("keypairFromSecret is deterministic", async () => {
    const sk = 12345678901234567890123456789n;
    const kp1 = await keypairFromSecret(sk);
    const kp2 = await keypairFromSecret(sk);
    expect(kp1.publicKey.x).toBe(kp2.publicKey.x);
    expect(kp1.publicKey.y).toBe(kp2.publicKey.y);
  });

  test("different secrets produce different keypairs", async () => {
    const kp1 = await keypairFromSecret(111n);
    const kp2 = await keypairFromSecret(222n);
    expect(kp1.publicKey.x).not.toBe(kp2.publicKey.x);
  });
});
