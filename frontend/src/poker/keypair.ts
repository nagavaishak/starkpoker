import { getBabyJub, BJJPoint } from "./babyJub";

export interface BJJKeypair {
  secretKey: bigint;
  publicKey: BJJPoint;
}

// Baby Jubjub curve order (subgroup order of the Base8 generator)
const BJJ_ORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;

export async function generateKeypair(): Promise<BJJKeypair> {
  // Random sk in [1, BJJ_ORDER - 1]
  const skBytes = new Uint8Array(32);
  crypto.getRandomValues(skBytes);
  const skRaw = BigInt("0x" + Buffer.from(skBytes).toString("hex"));
  const secretKey = (skRaw % (BJJ_ORDER - 1n)) + 1n;
  return keypairFromSecret(secretKey);
}

export async function keypairFromSecret(secretKey: bigint): Promise<BJJKeypair> {
  const babyJub = await getBabyJub();
  const pk = babyJub.mulPointEscalar(babyJub.Base8, secretKey);
  const publicKey: BJJPoint = {
    x: BigInt(babyJub.F.toString(pk[0])),
    y: BigInt(babyJub.F.toString(pk[1])),
  };
  return { secretKey, publicKey };
}
