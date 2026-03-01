import { createHash } from "crypto";
import { getBabyJub, BJJPoint, rawToPoint, pointToRaw } from "./babyJub";
import { MaskedCard, maskCard, cardIndexToPoint } from "./elgamal";

// Pre-compute all 52 card points: card i → (i+1)*G
export async function encodeDeck(): Promise<BJJPoint[]> {
  const points: BJJPoint[] = [];
  for (let i = 0; i < 52; i++) {
    points.push(await cardIndexToPoint(i));
  }
  return points;
}

// Shuffle: apply random permutation to masked deck and compute commit hash
export function shuffleDeck(maskedDeck: MaskedCard[]): {
  shuffled: MaskedCard[];
  permutation: number[];
  commitHash: string;
} {
  if (maskedDeck.length !== 52) throw new Error(`Expected 52 cards, got ${maskedDeck.length}`);

  // Fisher-Yates shuffle with crypto random
  const permutation = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const rBytes = new Uint8Array(4);
    crypto.getRandomValues(rBytes);
    const rand = new DataView(rBytes.buffer).getUint32(0, false);
    const j = rand % (i + 1);
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }

  const shuffled = permutation.map((idx) => maskedDeck[idx]);

  // Commit hash: SHA256 of all (c1.x, c2.x) pairs in shuffled order
  const data = shuffled.map((c) => `${c.c1.x},${c.c1.y},${c.c2.x},${c.c2.y}`).join("|");
  const commitHash = createHash("sha256").update(data).digest("hex");

  return { shuffled, permutation, commitHash };
}

// Rerandomize: add fresh randomness to each El Gamal ciphertext
// New C1' = C1 + s*G, New C2' = C2 + s*APK  (re-randomization with fresh scalar s)
export async function rerandomizeDeck(maskedDeck: MaskedCard[], apk: BJJPoint): Promise<MaskedCard[]> {
  const babyJub = await getBabyJub();
  const BJJ_ORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;

  return Promise.all(
    maskedDeck.map(async (card) => {
      const sBytes = new Uint8Array(32);
      crypto.getRandomValues(sBytes);
      const sRaw = BigInt("0x" + Buffer.from(sBytes).toString("hex"));
      const s = (sRaw % (BJJ_ORDER - 1n)) + 1n;

      const sG = babyJub.mulPointEscalar(babyJub.Base8, s);
      const sApk = babyJub.mulPointEscalar(pointToRaw(babyJub, apk), s);

      const newC1 = babyJub.addPoint(pointToRaw(babyJub, card.c1), sG);
      const newC2 = babyJub.addPoint(pointToRaw(babyJub, card.c2), sApk);

      return {
        c1: rawToPoint(babyJub, newC1),
        c2: rawToPoint(babyJub, newC2),
        r: card.r, // r is not meaningful after rerandomization but kept for type compat
      };
    })
  );
}
