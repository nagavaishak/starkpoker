import { encodeDeck, shuffleDeck, rerandomizeDeck } from "../src/deck";
import { keypairFromSecret, keypairFromSecret as kp } from "../src/keypair";
import { maskCard, partialDecrypt, recoverCard, computeAggregateKey } from "../src/elgamal";

describe("deck", () => {
  test("encodeDeck returns 52 distinct points", async () => {
    const deck = await encodeDeck();
    expect(deck).toHaveLength(52);
    const keys = new Set(deck.map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(52);
  });

  test("shuffleDeck: all 52 cards present after shuffle, permutation is a bijection", async () => {
    const alice = await keypairFromSecret(11111n);
    const apk = alice.publicKey;
    const masked = await Promise.all(Array.from({ length: 52 }, (_, i) => maskCard(i, apk)));
    const { shuffled, permutation, commitHash } = shuffleDeck(masked);

    expect(shuffled).toHaveLength(52);
    expect(permutation).toHaveLength(52);
    expect(new Set(permutation).size).toBe(52); // bijection
    expect(commitHash).toHaveLength(64); // hex sha256
  });
});
