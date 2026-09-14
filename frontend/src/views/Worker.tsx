/**
 * Worker view (placeholder).
 *
 * Scaffold only — task browsing and confirmation UI will be built on a
 * later branch.
 */

import { useWallet } from "../wallet/WalletContext";

export default function Worker() {
  const { isConnected, publicKey } = useWallet();

  return (
    <section className="view">
      <h2>Worker</h2>
      <p>
        Browse assigned tasks, submit completion proofs, and withdraw earnings.
        The task UI is not built yet — this is a scaffold.
      </p>
      {!isConnected ? (
        <p className="hint">
          Connect your Freighter wallet (top right) to see your tasks.
        </p>
      ) : (
        <p className="hint">
          Connected as <code>{publicKey}</code>
        </p>
      )}
    </section>
  );
}
