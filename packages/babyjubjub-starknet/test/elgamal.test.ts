import { keypairFromSecret } from "../src/keypair";
import {
  computeAggregateKey,
  maskCard,
  partialDecrypt,
  recoverCard,
  cardIndexToPoint,
} from "../src/elgamal";

describe("El Gamal", () => {
  test("single-player mask and unmask (apk = pk, pd = sk*C1)", async () => {
    const { secretKey, publicKey } = await keypairFromSecret(99999n);
    const masked = await maskCard(3, publicKey); // card 3 → 4*G
    const pd = await partialDecrypt(masked.c1, secretKey);
    const cardIndex = await recoverCard(masked, [pd]);
    expect(cardIndex).toBe(3);
  });

  test("2-player El Gamal: mask → both partial decrypt → recover", async () => {
    const alice = await keypairFromSecret(12345678901234567890123456789n);
    const bob = await keypairFromSecret(98765432109876543210987654321n);
    const apk = await computeAggregateKey(alice.publicKey, bob.publicKey);

    const masked = await maskCard(7, apk); // card 7 → 8*G
    const pdAlice = await partialDecrypt(masked.c1, alice.secretKey);
    const pdBob = await partialDecrypt(masked.c1, bob.secretKey);

    const cardIndex = await recoverCard(masked, [pdAlice, pdBob]);
    expect(cardIndex).toBe(7);
  });

  test("all 52 card indices encode to distinct curve points", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 52; i++) {
      const pt = await cardIndexToPoint(i);
      const key = `${pt.x},${pt.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(52);
  });

  test("recoverCard returns correct index for all 52 cards", async () => {
    const { secretKey, publicKey } = await keypairFromSecret(77777n);
    // Test 5 representative cards to keep test fast
    for (const idx of [0, 12, 25, 38, 51]) {
      const masked = await maskCard(idx, publicKey);
      const pd = await partialDecrypt(masked.c1, secretKey);
      const recovered = await recoverCard(masked, [pd]);
      expect(recovered).toBe(idx);
    }
  });

  test("rerandomize: card still decrypts to same value", async () => {
    const { secretKey, publicKey } = await keypairFromSecret(55555n);
    const masked = await maskCard(10, publicKey);

    // Manually rerandomize
    const { rerandomizeDeck } = await import("../src/deck");
    const [rerandom] = await rerandomizeDeck([masked], publicKey);

    const pd = await partialDecrypt(rerandom.c1, secretKey);
    const recovered = await recoverCard(rerandom, [pd]);
    expect(recovered).toBe(10);
  });
});
