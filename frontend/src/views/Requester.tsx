/**
 * Requester view.
 *
 * Hosts the create-task form. The escrow status list will be added to this
 * view in the next commit; SDK wiring for both happens in a later branch.
 */

import { useWallet } from "../wallet/WalletContext";
import { CreateTaskForm } from "./requester/CreateTaskForm";

export default function Requester() {
  const { isConnected, publicKey } = useWallet();

  if (!isConnected) {
    return (
      <section className="view">
        <h2>Requester</h2>
        <p>Create tasks and fund escrows.</p>
        <p className="hint">
          Connect your Freighter wallet (top right) to create a task.
        </p>
      </section>
    );
  }

  return (
    <section className="view">
      <h2>Requester</h2>
      <p className="hint">
        Connected as <code>{publicKey}</code>
      </p>
      <CreateTaskForm />
    </section>
  );
}
