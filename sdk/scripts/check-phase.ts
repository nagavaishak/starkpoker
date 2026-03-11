import { RpcProvider } from "starknet";
const provider = new RpcProvider({ nodeUrl: "https://api.cartridge.gg/x/starknet/sepolia" });
const GAME = "0x214feb287b4e3892646c78d4d7a24e8a5b810858187c03ecc423838fd2f4781";
async function main() {
  // Check game_count (how many games created)
  try {
    const r = await provider.callContract({ contractAddress: GAME, entrypoint: "get_game_count", calldata: [] });
    console.log("game_count:", r[0]);
  } catch(e: any) { console.log("game_count: no getter available"); }

  // Check pot (u256 - won't panic for uninitialized games)
  for (const id of ["0","1","2","3"]) {
    try {
      const r = await provider.callContract({ contractAddress: GAME, entrypoint: "get_pot", calldata: [id] });
      const pot = BigInt(r[0]) + BigInt(r[1]) * (1n << 128n);
      console.log(`game ${id} -> pot: ${pot}`);
    } catch(e: any) { console.log(`game ${id} -> pot error:`, e.message?.slice(0, 60)); }
  }

  // Check player1 (ContractAddress - also won't panic for uninitialized)
  for (const id of ["0","1","2","3"]) {
    try {
      const r = await provider.callContract({ contractAddress: GAME, entrypoint: "get_player1", calldata: [id] });
      console.log(`game ${id} -> player1: ${r[0]}`);
    } catch(e: any) { console.log(`game ${id} -> player1 error`); }
  }
}
main();
