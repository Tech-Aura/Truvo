/**
 * Header wallet widget.
 *
 * Shows a "Connect Wallet" button when disconnected, and the connected
 * public key (truncated, click-to-copy) plus network badge when connected.
 */

import { useCallback, useState } from "react";
import { useWallet } from "./WalletContext";

/** Truncate a Stellar public key for display: GABCD…WXYZ */
function truncateKey(key: string): string {
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function ConnectButton() {
  const {
    publicKey,
    isConnected,
    isConnecting,
    network,
    error,
    hasFreighter,
    connect,
    disconnect,
  } = useWallet();

  const [copied, setCopied] = useState(false);

  const copyKey = useCallback(async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — ignore.
    }
  }, [publicKey]);

  if (!isConnected) {
    return (
      <div className="wallet-widget">
        {!hasFreighter && (
          <span className="wallet-warning">
            Freighter not detected —{" "}
            <a
              href="https://freighter.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              install it
            </a>
          </span>
        )}
        <button onClick={connect} disabled={isConnecting}>
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {error && <span className="wallet-error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="wallet-widget">
      {network && (
        <span
          className={`wallet-badge ${network === "TESTNET" ? "badge-testnet" : "badge-other"}`}
          title={`Freighter network: ${network}`}
        >
          {network}
        </span>
      )}
      <button
        className="wallet-key"
        onClick={copyKey}
        title="Click to copy public key"
      >
        {copied ? "Copied!" : truncateKey(publicKey!)}
      </button>
      <button onClick={disconnect} title="Disconnect wallet">
        Disconnect
      </button>
    </div>
  );
}
