/**
 * deploy-sepolia.ts — Declare + deploy new PokerGame on Sepolia
 */
import { RpcProvider, Account, CallData, stark, hash } from "starknet";
import { readFileSync } from "fs";

const RPC_URL        = "https://api.cartridge.gg/x/starknet/sepolia";
const DEPLOYER_ADDR  = "0x0688b2fd40580944024e7cc5dab915a80d892f8a404911d4d171ab08322fb0fb";
const DEPLOYER_KEY   = "0x0260c0f93e326ef62f8f46d49f5156dad19abf2451520d7f727cea9115931ccc";
const STRK_ADDRESS   = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
// Dummy verifier address (no ZK verification in demo — any address works)
const VERIFIER_ADDR  = "0x0000000000000000000000000000000000000000000000000000000000000001";

const CONTRACTS_DIR = "/Users/shashank/Desktop/Hackathon projects/starkpoker/contracts/target/dev";
const CONTRACT_CLASS  = `${CONTRACTS_DIR}/starkpoker_contracts_PokerGame.contract_class.json`;
const COMPILED_CLASS  = `${CONTRACTS_DIR}/starkpoker_contracts_PokerGame.compiled_contract_class.json`;

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account  = new (Account as any)({ provider, address: DEPLOYER_ADDR, signer: DEPLOYER_KEY });

  const sierra   = JSON.parse(readFileSync(CONTRACT_CLASS,  "utf8"));
  const casm     = JSON.parse(readFileSync(COMPILED_CLASS,  "utf8"));

  console.log("Declaring contract...");
  const declareRes = await account.declare({ contract: sierra, casm });
  console.log("  class_hash:", declareRes.class_hash);
  await provider.waitForTransaction(declareRes.transaction_hash);
  console.log("  ✅ Declared");

  const classHash = declareRes.class_hash;

  console.log("\nDeploying contract...");
  const salt = stark.randomAddress();
  const ctor = CallData.compile({ strk_addr: STRK_ADDRESS, verifier_addr: VERIFIER_ADDR });
  const addr  = hash.calculateContractAddressFromHash(salt, classHash, ctor, 0);
  console.log("  predicted address:", addr);

  const deployRes = await account.deployContract({
    classHash,
    salt,
    constructorCalldata: ctor,
  });
  await provider.waitForTransaction(deployRes.transaction_hash);
  console.log("  ✅ Deployed at:", deployRes.contract_address ?? addr);
  console.log("\nUpdate GAME_ADDRESS in frontend/src/lib/contracts.ts to:", deployRes.contract_address ?? addr);
}

main().catch(err => {
  console.error("❌", err.message ?? err);
  process.exit(1);
});
