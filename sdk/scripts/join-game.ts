import { Account, RpcProvider } from "starknet";

const GAME_ADDRESS = "0x214feb287b4e3892646c78d4d7a24e8a5b810858187c03ecc423838fd2f4781";
const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const RPC_URL = "https://api.cartridge.gg/x/starknet/sepolia";

const PLAYER2_ADDRESS = "0x0688b2fd40580944024e7cc5dab915a80d892f8a404911d4d171ab08322fb0fb";
const PLAYER2_PRIVATE_KEY = "0x0260c0f93e326ef62f8f46d49f5156dad19abf2451520d7f727cea9115931ccc";

function u256cd(v: bigint): string[] {
  return [
    (v & ((1n << 128n) - 1n)).toString(),
    (v >> 128n).toString(),
  ];
}
function addr(a: string): string {
  return BigInt(a).toString();
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new (Account as any)({ provider, address: PLAYER2_ADDRESS, signer: PLAYER2_PRIVATE_KEY });

  const ANTE = 1_000_000_000_000_000_000n; // 1 STRK
  const GAME_ID = "0"; // game 0x0

  console.log("P2 address:", PLAYER2_ADDRESS);
  console.log("Submitting: approve + join_game(0) with 1 STRK ante...");

  const res = await account.execute([
    {
      contractAddress: STRK_ADDRESS,
      entrypoint: "approve",
      calldata: [addr(GAME_ADDRESS), ...u256cd(ANTE)],
    },
    {
      contractAddress: GAME_ADDRESS,
      entrypoint: "join_game",
      calldata: [GAME_ID],
    },
  ]);

  console.log("Tx hash:", res.transaction_hash);
  console.log("Waiting for confirmation...");
  await provider.waitForTransaction(res.transaction_hash);
  console.log("✅ Joined game 0x0 as Player 2!");
}

main().catch(err => {
  console.error("❌ Error:", err.message ?? err);
  process.exit(1);
});
