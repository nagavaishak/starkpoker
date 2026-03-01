"use client";

import { useState } from "react";
import { useConnect, useDisconnect, useAccount } from "@starknet-react/core";

export function WalletConnect() {
  const { connectors, connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const { address, status } = useAccount();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleConnect = async (connector: (typeof connectors)[0]) => {
    setErr(null);
    setConnecting(connector.id);
    try {
      await connectAsync({ connector });
    } catch (e: any) {
      // Braavos doesn't support wallet_switchStarknetChain — the wallet is
      // still connected; starknet-react just couldn't switch chains. Ignore.
      if (e?.message?.includes("wallet_switchStarknetChain")) return;
      setErr(e?.message ?? "Connection failed");
    } finally {
      setConnecting(null);
    }
  };

  if (status === "connected" && address) {
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-green-400 font-mono">{short}</span>
        <button
          onClick={() => disconnect()}
          className="px-3 py-1 rounded-md text-sm bg-gray-700 hover:bg-gray-600 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        {connectors.map((connector) => (
          <button
            key={connector.id}
            onClick={() => handleConnect(connector)}
            disabled={connecting === connector.id}
            className="px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 disabled:opacity-60
              text-black font-semibold text-sm transition-colors shadow-md"
          >
            {connecting === connector.id ? "Connecting…" : connector.name}
          </button>
        ))}
        {connectors.length === 0 && (
          <span className="text-sm text-gray-400">No wallets detected. Install ArgentX or Braavos.</span>
        )}
      </div>
      {err && <p className="text-red-400 text-xs">{err}</p>}
    </div>
  );
}
