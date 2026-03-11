import { RpcProvider } from "starknet";
const provider = new RpcProvider({ nodeUrl: "https://api.cartridge.gg/x/starknet/sepolia" });
const GAME = "0x214feb287b4e3892646c78d4d7a24e8a5b810858187c03ecc423838fd2f4781";
async function main() {
  process.stdout.write("Waiting for game to appear on-chain");
  for (;;) {
    for (const id of ["0","1","2","3"]) {
      try {
        const r = await provider.callContract({ contractAddress: GAME, entrypoint: "get_pot", calldata: [id] });
        const pot = BigInt(r[0]) + BigInt(r[1]) * (1n << 128n);
        if (pot > 0n) {
          console.log(`\n✅ Game ${id} found! Pot: ${Number(pot)/1e18} STRK`);
          const p1 = await provider.callContract({ contractAddress: GAME, entrypoint: "get_player1", calldata: [id] });
          console.log(`   Player1: ${p1[0]}`);
          process.exit(0);
        }
      } catch {}
    }
    process.stdout.write(".");
    await new Promise(r => setTimeout(r, 5000));
  }
}
main();
