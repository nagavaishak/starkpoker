import { RpcProvider } from "starknet";
const provider = new RpcProvider({ nodeUrl: "https://api.cartridge.gg/x/starknet/sepolia" });
const OLD = "0x0006005f4adc7ceffeb86779ceedc89855ee5cb24f3841fa3dfe6a8d66059208";
const NEW = "0x214feb287b4e3892646c78d4d7a24e8a5b810858187c03ecc423838fd2f4781";
async function check(label: string, addr: string) {
  console.log(`\n--- ${label} ---`);
  for (const id of ["0","1","2","3"]) {
    try {
      const r = await provider.callContract({ contractAddress: addr, entrypoint: "get_pot", calldata: [id] });
      const pot = BigInt(r[0]) + BigInt(r[1]) * (1n << 128n);
      if (pot > 0n) {
        const p1 = await provider.callContract({ contractAddress: addr, entrypoint: "get_player1", calldata: [id] });
        console.log(`  game ${id}: pot=${Number(pot)/1e18} STRK  p1=${p1[0]}`);
      }
    } catch {}
  }
}
await check("OLD contract", OLD);
await check("NEW contract", NEW);
