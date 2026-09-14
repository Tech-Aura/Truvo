/**
 * Admin view (placeholder).
 *
 * Scaffold only — arbitrator/dispute resolution UI will be built on a
 * later branch.
 */

import { useWallet } from "../wallet/WalletContext";

export default function Admin() {
  const { isConnected, publicKey } = useWallet();

  return (
    <section className="view">
      <h2>Admin</h2>
      <p>
        Arbitrator view for resolving disputes. The dispute resolution UI is
        not built yet — this is a scaffold.
      </p>
      {!isConnected ? (
        <p className="hint">
          Connect the arbitrator's Freighter wallet (top right) to manage
          disputes.
        </p>
      ) : (
        <p className="hint">
          Connected as <code>{publicKey}</code>
        </p>
      )}
    </section>
  );
}
