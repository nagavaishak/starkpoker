pragma circom 2.0.0;

// circomlib must be installed in circuits/partial_decrypt/node_modules/
include "../../node_modules/circomlib/circuits/babyjub.circom";
include "../../node_modules/circomlib/circuits/escalarmulany.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

// Chaum-Pedersen proof over Baby Jubjub:
// Proves knowledge of sk such that:
//   pk = sk * G     (registered public key)
//   pd = sk * C1    (partial decryption of El Gamal C1 component)
//
// This proves the same scalar sk was used for both, without revealing sk.
template PartialDecrypt() {
    // Private: the player's secret key
    signal input sk;

    // Public: known to verifier
    signal input pk[2];   // pk = sk * G (player's registered public key)
    signal input c1[2];   // El Gamal C1 component of the masked card
    signal input pd[2];   // Claimed partial decrypt = sk * C1

    // Convert sk to 253-bit representation (Baby Jubjub order is ~253 bits)
    component skBits = Num2Bits(253);
    skBits.in <== sk;

    // Verify pk = sk * G (Baby Jubjub Base8 generator)
    component pkMul = EscalarMulAny(253);
    for (var i = 0; i < 253; i++) {
        pkMul.e[i] <== skBits.out[i];
    }
    // Baby Jubjub Base8 point coordinates (from circomlib)
    pkMul.p[0] <== 5299619240641551281634865583518297030282874472190772894086521144482721001553;
    pkMul.p[1] <== 16950150798460657717958625567821834550301663161624707787222815936182638968203;
    pk[0] === pkMul.out[0];
    pk[1] === pkMul.out[1];

    // Verify pd = sk * C1
    component pdMul = EscalarMulAny(253);
    for (var i = 0; i < 253; i++) {
        pdMul.e[i] <== skBits.out[i];
    }
    pdMul.p[0] <== c1[0];
    pdMul.p[1] <== c1[1];
    pd[0] === pdMul.out[0];
    pd[1] === pdMul.out[1];
}

component main { public [pk, c1, pd] } = PartialDecrypt();
