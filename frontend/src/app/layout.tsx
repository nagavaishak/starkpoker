import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ErrorBoundary } from "./ErrorBoundary";

export const metadata: Metadata = {
  title: "StarkPoker — Trustless Mental Poker on Starknet",
  description: "5-card draw poker with ZK-proven card dealing. No server. No trust. Powered by Baby Jubjub El Gamal encryption.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <ErrorBoundary>
          <Providers>{children}</Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
