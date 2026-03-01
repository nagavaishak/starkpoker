declare module "circomlibjs" {
  interface BabyJub {
    F: {
      e(v: bigint | number | string): unknown;
      toString(v: unknown): string;
      neg(v: unknown): unknown;
      eq(a: unknown, b: unknown): boolean;
    };
    Base8: unknown[];
    addPoint(a: unknown[], b: unknown[]): unknown[];
    mulPointEscalar(base: unknown[], scalar: bigint): unknown[];
    inCurve(p: unknown[]): boolean;
  }

  export function buildBabyjub(): Promise<BabyJub>;
}
