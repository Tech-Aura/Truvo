/**
 * Requester view.
 *
 * Hosts the create-task form and the escrow status list. Both currently
 * use placeholder handlers/mock data; SDK wiring happens in a later branch.
 */

import { useWallet } from "../wallet/WalletContext";
import { CreateTaskForm } from "./requester/CreateTaskForm";
import { EscrowStatusList } from "./requester/EscrowStatusList";

export default function Requester() {
  const { isConnected, publicKey } = useWallet();

  if (!isConnected) {
    return (
      <section className="view">
        <h2>Requester</h2>
        <p>Create tasks and fund escrows.</p>
        <p className="hint">
          Connect your Freighter wallet (top right) to create a task and see
          your escrows.
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
      <EscrowStatusList />
    </section>
  );
}
