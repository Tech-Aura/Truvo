/**
 * Worker view.
 *
 * Displays assigned tasks for the connected worker account, provides
 * status filtering, and hosts completion proof submissions and
 * off-ramp withdrawals. Now wired to the Truvo SDK for real on-chain
 * task fetching and contract execution.
 */

import { useWallet } from "../wallet/WalletContext";
import { WorkerTaskList } from "./worker/WorkerTaskList";

export default function Worker() {
  const { isConnected, publicKey } = useWallet();

  if (!isConnected) {
    return (
      <section className="view">
        <h2>Worker</h2>
        <p>Browse assigned tasks, submit completion proofs, and withdraw earnings.</p>
        <p className="hint">
          Connect your Freighter wallet (top right) to see your tasks.
        </p>
      </section>
    );
  }

  return (
    <section className="view">
      <h2>Worker</h2>
      <p className="hint">
        Connected as <code>{publicKey}</code>
      </p>
      <WorkerTaskList workerAddress={publicKey} />
    </section>
  );
}
