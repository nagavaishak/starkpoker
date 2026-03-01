import { getBabyJub, BJJPoint, rawToPoint, pointToRaw } from "./babyJub";

export interface MaskedCard {
  c1: BJJPoint; // r * G
  c2: BJJPoint; // (cardIndex+1)*G + r * APK
  r: bigint;    // blinding factor — NEVER publish
}

// Baby Jubjub subgroup order
const BJJ_ORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;

export async function computeAggregateKey(pk1: BJJPoint, pk2: BJJPoint): Promise<BJJPoint> {
  const babyJub = await getBabyJub();
  const raw = babyJub.addPoint(pointToRaw(babyJub, pk1), pointToRaw(babyJub, pk2));
  return rawToPoint(babyJub, raw);
}

export async function pointAdd(a: BJJPoint, b: BJJPoint): Promise<BJJPoint> {
  const babyJub = await getBabyJub();
  return rawToPoint(babyJub, babyJub.addPoint(pointToRaw(babyJub, a), pointToRaw(babyJub, b)));
}

export async function scalarMul(point: BJJPoint, scalar: bigint): Promise<BJJPoint> {
  const babyJub = await getBabyJub();
  return rawToPoint(babyJub, babyJub.mulPointEscalar(pointToRaw(babyJub, point), scalar));
}

// Card encoding: card i → (i+1)*G  (correction: NOT i*G, avoids point-at-infinity for i=0)
export async function cardIndexToPoint(cardIndex: number): Promise<BJJPoint> {
  if (cardIndex < 0 || cardIndex > 51) throw new Error(`Invalid card index: ${cardIndex}`);
  const babyJub = await getBabyJub();
  const raw = babyJub.mulPointEscalar(babyJub.Base8, BigInt(cardIndex + 1));
  return rawToPoint(babyJub, raw);
}

// El Gamal masking: C1 = r*G, C2 = cardPoint + r*APK
export async function maskCard(cardIndex: number, apk: BJJPoint): Promise<MaskedCard> {
  const babyJub = await getBabyJub();

  // Random blinding factor r ∈ [1, BJJ_ORDER-1]
  const rBytes = new Uint8Array(32);
  crypto.getRandomValues(rBytes);
  const rRaw = BigInt("0x" + Buffer.from(rBytes).toString("hex"));
  const r = (rRaw % (BJJ_ORDER - 1n)) + 1n;

  const cardPoint = await cardIndexToPoint(cardIndex);
  const c1Raw = babyJub.mulPointEscalar(babyJub.Base8, r);
  const rApkRaw = babyJub.mulPointEscalar(pointToRaw(babyJub, apk), r);
  const c2Raw = babyJub.addPoint(pointToRaw(babyJub, cardPoint), rApkRaw);

  return {
    c1: rawToPoint(babyJub, c1Raw),
    c2: rawToPoint(babyJub, c2Raw),
    r,
  };
}

// Partial decryption: pd = sk * C1
export async function partialDecrypt(c1: BJJPoint, secretKey: bigint): Promise<BJJPoint> {
  const babyJub = await getBabyJub();
  const raw = babyJub.mulPointEscalar(pointToRaw(babyJub, c1), secretKey);
  return rawToPoint(babyJub, raw);
}

// Recover card from masked card + all partial decrypts
// Formula: C2 - sum(PDs) = cardPoint → lookup in precomputed table
export async function recoverCard(masked: MaskedCard, partialDecrypts: BJJPoint[]): Promise<number> {
  const babyJub = await getBabyJub();
  const F = babyJub.F;

  // Sum all partial decrypts
  let combined = pointToRaw(babyJub, partialDecrypts[0]);
  for (let i = 1; i < partialDecrypts.length; i++) {
    combined = babyJub.addPoint(combined, pointToRaw(babyJub, partialDecrypts[i]));
  }

  // Negate combined (twisted Edwards: negate x to negate point)
  const negCombined = [F.neg(combined[0]), combined[1]];

  // Recover card point: C2 - combined
  const recoveredRaw = babyJub.addPoint(pointToRaw(babyJub, masked.c2), negCombined);
  const recovered: BJJPoint = rawToPoint(babyJub, recoveredRaw);

  // Lookup: card i encodes as (i+1)*G
  for (let i = 0; i < 52; i++) {
    const pt = await cardIndexToPoint(i);
    if (pt.x === recovered.x && pt.y === recovered.y) return i;
  }

  throw new Error(`Could not recover card — point not in deck: (${recovered.x}, ${recovered.y})`);
}
