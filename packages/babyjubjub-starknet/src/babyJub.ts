// Singleton wrapper around circomlibjs buildBabyjub
import { buildBabyjub } from "circomlibjs";

export interface BJJPoint {
  x: bigint;
  y: bigint;
}

let _instance: Awaited<ReturnType<typeof buildBabyjub>> | null = null;

export async function getBabyJub() {
  if (!_instance) _instance = await buildBabyjub();
  return _instance;
}

// Convert internal F element to bigint
export function fToBigint(babyJub: Awaited<ReturnType<typeof buildBabyjub>>, fe: unknown): bigint {
  return BigInt(babyJub.F.toString(fe));
}

// Convert a circomlibjs point array [F, F] to BJJPoint
export function rawToPoint(babyJub: Awaited<ReturnType<typeof buildBabyjub>>, raw: unknown[]): BJJPoint {
  return {
    x: fToBigint(babyJub, raw[0]),
    y: fToBigint(babyJub, raw[1]),
  };
}

// Convert BJJPoint back to internal F elements
export function pointToRaw(babyJub: Awaited<ReturnType<typeof buildBabyjub>>, pt: BJJPoint): unknown[] {
  return [babyJub.F.e(pt.x), babyJub.F.e(pt.y)];
}

// Baby Jubjub Base8 generator coordinates (from circomlib)
export const BASE8_X = 5299619240641551281634865583518297030282874472190772894086521144482721001553n;
export const BASE8_Y = 16950150798460657717958625567821834550301663161624707787222815936182638968203n;
