declare module "snarkjs" {
  namespace groth16 {
    function fullProve(
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFile: string
    ): Promise<{ proof: Groth16ProofData; publicSignals: string[] }>;

    function verify(
      vkey: unknown,
      publicSignals: string[],
      proof: Groth16ProofData
    ): Promise<boolean>;

    function prove(
      zkeyFile: string,
      witnessFile: string
    ): Promise<{ proof: Groth16ProofData; publicSignals: string[] }>;
  }

  interface Groth16ProofData {
    pi_a: [string, string, string];       // G1 point [x, y, "1"]
    pi_b: [[string, string], [string, string], [string, string]]; // G2 point
    pi_c: [string, string, string];       // G1 point [x, y, "1"]
    protocol: string;
    curve: string;
  }
}
