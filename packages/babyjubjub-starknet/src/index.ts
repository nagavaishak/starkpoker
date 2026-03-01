// babyjubjub-starknet — Baby Jubjub El Gamal for Starknet
// Built for Re{define} Hackathon 2026

export type { BJJPoint } from "./babyJub";
export { getBabyJub, BASE8_X, BASE8_Y } from "./babyJub";

export type { BJJKeypair } from "./keypair";
export { generateKeypair, keypairFromSecret } from "./keypair";

export type { MaskedCard } from "./elgamal";
export {
  computeAggregateKey,
  pointAdd,
  scalarMul,
  cardIndexToPoint,
  maskCard,
  partialDecrypt,
  recoverCard,
} from "./elgamal";

export { encodeDeck, shuffleDeck, rerandomizeDeck } from "./deck";
