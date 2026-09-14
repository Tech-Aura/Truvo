/**
 * Requester view (placeholder).
 *
 * Scaffold only — escrow creation UI will be built on a later branch.
 */

import { useWallet } from "../wallet/WalletContext";

export default function Requester() {
  const { isConnected, publicKey } = useWallet();

  return (
    <section className="view">
      <h2>Requester</h2>
      <p>
        Create tasks and fund escrows. The task creation UI is not built yet —
        this is a scaffold.
      </p>
      {!isConnected ? (
        <p className="hint">
          Connect your Freighter wallet (top right) to get started.
        </p>
      ) : (
        <p className="hint">
          Connected as <code>{publicKey}</code>
        </p>
      )}
    </section>
  );
}
