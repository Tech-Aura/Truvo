/**
 * Wallet connection state for the Truvo frontend.
 *
 * Wraps the Freighter browser extension (@stellar/freighter-api) and makes
 * the connected account available throughout the app via React context.
 *
 * Usage:
 *   const { publicKey, isConnected, connect, disconnect } = useWallet();
 *
 * Only the public key is ever handled here — the user's secret key never
 * leaves the Freighter extension. Transaction signing is delegated to
 * Freighter when escrow features are built on top of this scaffold.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  isConnected as freighterIsConnected,
  getAddress,
  getNetwork,
  requestAccess,
  WatchWalletChanges,
} from "@stellar/freighter-api";

export interface WalletState {
  /** Public key (G…) of the connected Freighter account, or null. */
  publicKey: string | null;
  /** True once a wallet is connected (publicKey is available). */
  isConnected: boolean;
  /** True while a connect/disconnect operation is in flight. */
  isConnecting: boolean;
  /** Freighter network name, e.g. "TESTNET" or "PUBLIC" (null until known). */
  network: string | null;
  /** Freighter network passphrase (null until known). */
  networkPassphrase: string | null;
  /** Human-readable error from the last connect attempt, or null. */
  error: string | null;
  /** True when the Freighter extension is detected in the browser. */
  hasFreighter: boolean;
  /** Prompt the user to connect their Freighter wallet. */
  connect: () => Promise<void>;
  /** Clear the local connection state (does not touch the extension). */
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

/**
 * Detect the Freighter extension without prompting the user.
 * @stellar/freighter-api's `isConnected()` returns a result object that may
 * reject on non-supporting browsers, so guard it defensively.
 */
async function detectFreighter(): Promise<boolean> {
  try {
    const result = await freighterIsConnected();
    return Boolean(result.isConnected);
  } catch {
    return false;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [networkPassphrase, setNetworkPassphrase] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFreighter, setHasFreighter] = useState(false);

  // Detect the extension on mount (no user prompt involved).
  useEffect(() => {
    let cancelled = false;
    detectFreighter().then((installed) => {
      if (!cancelled) setHasFreighter(installed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // If the app is already on Freighter's Allow List, restore the
  // connection silently on mount without prompting the user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await detectFreighter())) return;
      try {
        const { address } = await getAddress();
        if (cancelled || !address) return;
        setPublicKey(address);
        const net = await getNetwork();
        if (!cancelled && !net.error) {
          setNetwork(net.network);
          setNetworkPassphrase(net.networkPassphrase);
        }
      } catch {
        // Not authorized yet — the user must click "Connect Wallet".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll for account/network changes (e.g. the user switches accounts in
  // Freighter) and keep context state in sync. The watcher only fires the
  // callback when a value actually changes.
  const watcherRef = useRef<WatchWalletChanges | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await detectFreighter())) return;
      const watcher = new WatchWalletChanges(3000);
      watcherRef.current = watcher;
      watcher.watch(({ address, network: netName, networkPassphrase: pass }) => {
        if (cancelled) return;
        setPublicKey(address || null);
        setNetwork(netName);
        setNetworkPassphrase(pass);
      });
    })();
    return () => {
      cancelled = true;
      watcherRef.current?.stop();
      watcherRef.current = null;
    };
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    if (!(await detectFreighter())) {
      setError(
        "Freighter extension not detected. Install it from https://freighter.app and try again.",
      );
      return;
    }
    setIsConnecting(true);
    try {
      // requestAccess() adds the app to Freighter's Allow List and returns
      // the public key in one step (no popup if already authorized).
      const { address, error: accessError } = await requestAccess();
      if (accessError) {
        setError(accessError.message || "Freighter access was denied.");
        return;
      }
      if (!address) {
        setError("Freighter returned no public key. Is an account set up?");
        return;
      }
      setPublicKey(address);
      const { network: netName, networkPassphrase: pass, error: netError } =
        await getNetwork();
      if (!netError) {
        setNetwork(netName);
        setNetworkPassphrase(pass);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect to Freighter.",
      );
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setNetwork(null);
    setNetworkPassphrase(null);
    setError(null);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      publicKey,
      isConnected: publicKey !== null,
      isConnecting,
      network,
      networkPassphrase,
      error,
      hasFreighter,
      connect,
      disconnect,
    }),
    [
      publicKey,
      isConnecting,
      network,
      networkPassphrase,
      error,
      hasFreighter,
      connect,
      disconnect,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/**
 * Access the wallet connection state anywhere in the component tree.
 * Must be used inside {@link WalletProvider}.
 */
export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return ctx;
}
