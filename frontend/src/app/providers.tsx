"use client";

import { useState, useEffect } from "react";
import { StarknetConfig, jsonRpcProvider, argent, braavos } from "@starknet-react/core";
import { sepolia, mainnet } from "@starknet-react/chains";

const rpc = jsonRpcProvider({
  rpc: () => ({ nodeUrl: "https://api.cartridge.gg/x/starknet/sepolia" }),
});

const connectors = [argent(), braavos()];

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <StarknetConfig chains={[sepolia, mainnet]} provider={rpc} connectors={connectors} autoConnect>
      {children}
    </StarknetConfig>
  );
}
