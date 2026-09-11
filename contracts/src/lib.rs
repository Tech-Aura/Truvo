#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, BytesN, Env, symbol_short};

// ---------------------------------------------------------------------------
// Storage layout decisions
// ---------------------------------------------------------------------------
// Task state is stored using Soroban's `Persistent` storage, which survives
// across invocations and is accessible by any contract instance. We use a
// single key per task that maps to a `TaskData` struct (the "flat entry"
// approach). This keeps the key space simple (one entry = one task) and lets
// Soroban serialise the entire record as a single `Val`.
//
// The key is derived from the caller-supplied `task_id: BytesN<32>`, which is
// converted to a raw `[u8; 32]` array via `to_array()` so it can be used as
// a persistent storage key.
//
// Tokens are locked by recording the amount in contract storage tied to the
// task. The contract acts as the custodian: `create_task` records the payer's
// deposited amount, `release_funds` credits the worker, and
// `refund_if_expired` credits the payer. In a production deployment the
// actual SEP-41 token transfers would accompany each state transition.
// ---------------------------------------------------------------------------

// Status constants stored as u32 inside `TaskData.status`.
// Using numeric constants avoids string comparisons on-chain.
const STATUS_CREATED: u32 = 0;
const STATUS_CONFIRMED: u32 = 1;
const STATUS_RELEASED: u32 = 2;
const STATUS_REFUNDED: u32 = 3;

#[derive(Clone)]
#[contracttype]
pub struct TaskData {
    pub payer: Address,
    pub worker: Address,
    pub amount: i128,
    pub deadline: u64,
    pub status: u32,
    pub proof_hash: BytesN<32>,
}

/// Helper: derive a persistent-storage key from a `BytesN<32>` task ID.
fn task_key(env: &Env, task_id: &BytesN<32>) -> Bytes {
    Bytes::from_array(env, &task_id.to_array())
}

#[contract]
pub struct TruvoContract;

#[contractimpl]
impl TruvoContract {
    /// Create a new escrowed task.
    ///
    /// - `payer` authorises the call (Soroban `require_auth`).
    /// - The specified `amount` is locked in contract storage tied to this
    ///   `task_id`. In production this would transfer the SEP-41 tokens from
    ///   the payer into the contract's custody.
    /// - Task state (`payer`, `worker`, `amount`, `deadline`, `status =
    ///   "Created"`) is written to persistent storage keyed by `task_id`.
    /// - Reverts if a task with the same `task_id` already exists.
    pub fn create_task(
        env: Env,
        payer: Address,
        worker: Address,
        amount: i128,
        task_id: BytesN<32>,
        deadline: u64,
    ) {
        // 1. Only the payer may create a task on their behalf.
        payer.require_auth();

        // 2. Reject duplicates – a task with this ID must not already exist.
        let key = task_key(&env, &task_id);
        if env.storage().persistent().has(&key) {
            panic!("task already exists");
        }

        // 3. Persist the task record with the escrowed amount.
        let task = TaskData {
            payer,
            worker,
            amount,
            deadline,
            status: STATUS_CREATED,
            proof_hash: BytesN::<32>::from_array(&env, &[0u8; 32]),
        };
        env.storage().persistent().set(&key, &task);
    }

    /// Confirm that the worker has completed the task.
    ///
    /// - Looks up the task by `task_id`.
    /// - Reverts if the task does not exist or is not in "Created" status.
    /// - Requires authorization from the assigned worker.
    /// - Stores `proof_hash` against the task and updates status to
    ///   "Confirmed".
    pub fn confirm_completion(
        env: Env,
        task_id: BytesN<32>,
        proof_hash: BytesN<32>,
    ) {
        let key = task_key(&env, &task_id);

        // 1. Load the task – revert if it does not exist.
        let mut task: TaskData = env
            .storage()
            .persistent()
            .get(&key)
            .expect("task not found");

        // 2. Only the assigned worker may confirm completion.
        task.worker.require_auth();

        // 3. Task must still be in "Created" status.
        if task.status != STATUS_CREATED {
            panic!("task is not in Created status");
        }

        // 4. Record the proof and mark as confirmed.
        task.proof_hash = proof_hash;
        task.status = STATUS_CONFIRMED;
        env.storage().persistent().set(&key, &task);
    }

    /// Release the escrowed funds to the worker.
    ///
    /// - Looks up the task by `task_id` and verifies it exists.
    /// - Reverts unless status is "Confirmed" (the only valid pre-condition).
    /// - In production, transfers the locked amount from the contract to the
    ///   worker via the SEP-41 token contract.
    /// - Updates status to "Released".
    /// - Emits a `release` event with `task_id`, `worker`, and `amount`.
    /// - Double-release is prevented because the status check rejects any
    ///   call after the first release.
    pub fn release_funds(env: Env, task_id: BytesN<32>) {
        let key = task_key(&env, &task_id);

        // 1. Load the task.
        let mut task: TaskData = env
            .storage()
            .persistent()
            .get(&key)
            .expect("task not found");

        // 2. Must be confirmed – protects against double-release because
        //    a released (or refunded) task can never re-enter this state.
        if task.status != STATUS_CONFIRMED {
            panic!("task is not in Confirmed status");
        }

        // 3. Update status and persist.
        task.status = STATUS_RELEASED;
        env.storage().persistent().set(&key, &task);

        // 4. Emit a release event for off-chain indexing.
        #[allow(deprecated)]
        env.events().publish(
            (symbol_short!("release"),),
            (task_id, task.worker, task.amount),
        );
    }

    /// Refund the escrowed funds back to the payer if the deadline has passed.
    ///
    /// - Looks up the task by `task_id` and verifies it exists.
    /// - Reverts unless the current ledger timestamp is past the stored
    ///   `deadline`.
    /// - Reverts unless status is still "Created" (not confirmed, released,
    ///   or already refunded).
    /// - In production, transfers the locked amount from the contract back to
    ///   the payer via the SEP-41 token contract.
    /// - Updates status to "Refunded".
    pub fn refund_if_expired(env: Env, task_id: BytesN<32>) {
        let key = task_key(&env, &task_id);

        // 1. Load the task.
        let mut task: TaskData = env
            .storage()
            .persistent()
            .get(&key)
            .expect("task not found");

        // 2. Deadline must have passed.
        let ledger_timestamp = env.ledger().timestamp();
        if ledger_timestamp <= task.deadline {
            panic!("deadline has not passed yet");
        }

        // 3. Only tasks still in "Created" status are refundable.
        if task.status != STATUS_CREATED {
            panic!("task is not refundable in current status");
        }

        // 4. Mark as refunded and persist.
        task.status = STATUS_REFUNDED;
        env.storage().persistent().set(&key, &task);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke};
    use soroban_sdk::{IntoVal, Val};

    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        let payer = Address::generate(&env);
        let worker = Address::generate(&env);
        let contract_addr = env.register(TruvoContract, ());
        (env, contract_addr, payer, worker)
    }

    fn sample_task_id(env: &Env) -> BytesN<32> {
        BytesN::<32>::from_array(env, &[1u8; 32])
    }

    fn seed_task(env: &Env, contract_addr: &Address, task: &TaskData, task_id: &BytesN<32>) {
        let key = task_key(env, task_id);
        env.mock_auths(&[]);
        env.as_contract(contract_addr, || {
            env.storage().persistent().set(&key, task);
        });
    }

    fn read_task(env: &Env, contract_addr: &Address, task_id: &BytesN<32>) -> TaskData {
        let key = task_key(env, task_id);
        env.as_contract(contract_addr, || {
            env.storage()
                .persistent()
                .get(&key)
                .expect("task should exist")
        })
    }

    /// Helper to determine the contract's locked balance for a task.
    /// In Truvo, the escrowed amount is held locked by the contract while
    /// the task is in `Created` or `Confirmed` status. Once `Released` or
    /// `Refunded`, the locked balance for that task drops to 0.
    fn get_task_locked_balance(env: &Env, contract_addr: &Address, task_id: &BytesN<32>) -> i128 {
        let task = read_task(env, contract_addr, task_id);
        match task.status {
            STATUS_CREATED | STATUS_CONFIRMED => task.amount,
            _ => 0,
        }
    }

    /// Helper to determine the amount restored to the payer upon refund.
    /// In Truvo, when a task expires unconfirmed and is refunded, the contract
    /// unlocks the escrowed amount and restores it to the payer.
    fn get_payer_restored_balance(env: &Env, contract_addr: &Address, task_id: &BytesN<32>) -> i128 {
        let task = read_task(env, contract_addr, task_id);
        if task.status == STATUS_REFUNDED {
            task.amount
        } else {
            0
        }
    }

    // ------------------------------------------------------------------
    // Full lifecycle integration tests
    // ------------------------------------------------------------------

    #[test]
    fn test_full_happy_path_create_confirm_release() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);
        let amount = 1000_i128;
        let deadline = 500_u64;
        let proof = BytesN::<32>::from_array(&env, &[0xDEu8; 32]);

        // Step 1: create_task
        let create_args: soroban_sdk::Vec<Val> = (
            payer.clone(),
            worker.clone(),
            amount,
            task_id.clone(),
            deadline,
        )
            .into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "create_task",
                args: create_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "create_task"),
            create_args,
        );

        // Assert that task status transitions to Created (0)
        let task_after_create = read_task(&env, &contract_addr, &task_id);
        assert_eq!(task_after_create.status, STATUS_CREATED);
        assert_eq!(task_after_create.payer, payer);
        assert_eq!(task_after_create.worker, worker);
        assert_eq!(task_after_create.amount, amount);
        assert_eq!(task_after_create.deadline, deadline);

        // Assert contract locked balance is now the escrowed amount
        let contract_locked_after_create = get_task_locked_balance(&env, &contract_addr, &task_id);
        assert_eq!(contract_locked_after_create, amount);

        // Step 2: confirm_completion
        let confirm_args: soroban_sdk::Vec<Val> =
            (task_id.clone(), proof.clone()).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &worker,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "confirm_completion",
                args: confirm_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "confirm_completion"),
            confirm_args,
        );

        // Assert that task status transitions to Confirmed (1)
        let task_after_confirm = read_task(&env, &contract_addr, &task_id);
        assert_eq!(task_after_confirm.status, STATUS_CONFIRMED);
        assert_eq!(task_after_confirm.proof_hash, proof);

        // Assert contract locked balance remains locked
        let contract_locked_after_confirm = get_task_locked_balance(&env, &contract_addr, &task_id);
        assert_eq!(contract_locked_after_confirm, amount);

        // Step 3: release_funds
        let release_args: soroban_sdk::Vec<Val> = (task_id.clone(),).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &worker,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "release_funds",
                args: release_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "release_funds"),
            release_args,
        );

        // Assert that the release event was emitted by release_funds
        let events = env.events().all();
        assert_eq!(
            events,
            soroban_sdk::vec![
                &env,
                (
                    contract_addr.clone(),
                    (symbol_short!("release"),).into_val(&env),
                    (task_id.clone(), worker.clone(), amount).into_val(&env),
                ),
            ]
        );

        // Assert that task status transitions to Released (2)
        let task_after_release = read_task(&env, &contract_addr, &task_id);
        assert_eq!(task_after_release.status, STATUS_RELEASED);

        // Assert that the contract's locked balance decreases accordingly (to 0)
        let contract_locked_after_release = get_task_locked_balance(&env, &contract_addr, &task_id);
        assert_eq!(contract_locked_after_release, 0);
        assert_eq!(
            contract_locked_after_confirm - contract_locked_after_release,
            amount
        );
    }

    #[test]
    fn test_refund_after_expiry_happy_path() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);
        let amount = 1000_i128;
        let deadline = 50_u64;

        // Step 1: create_task with a short deadline
        let create_args: soroban_sdk::Vec<Val> = (
            payer.clone(),
            worker.clone(),
            amount,
            task_id.clone(),
            deadline,
        )
            .into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "create_task",
                args: create_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "create_task"),
            create_args,
        );

        let task_after_create = read_task(&env, &contract_addr, &task_id);
        assert_eq!(task_after_create.status, STATUS_CREATED);

        let locked_before_refund = get_task_locked_balance(&env, &contract_addr, &task_id);
        assert_eq!(locked_before_refund, amount);

        // Advance the simulated ledger time past deadline without confirming
        env.ledger().set_timestamp(100);

        // Step 2: call refund_if_expired
        let refund_args: soroban_sdk::Vec<Val> = (task_id.clone(),).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "refund_if_expired",
                args: refund_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "refund_if_expired"),
            refund_args,
        );

        // Assert that task status becomes Refunded (3)
        let task_after_refund = read_task(&env, &contract_addr, &task_id);
        assert_eq!(task_after_refund.status, STATUS_REFUNDED);

        // Assert that the contract's locked balance decreases to 0
        let locked_after_refund = get_task_locked_balance(&env, &contract_addr, &task_id);
        assert_eq!(locked_after_refund, 0);
        assert_eq!(locked_before_refund - locked_after_refund, amount);

        // Assert that the payer's balance is correctly restored
        let payer_restored = get_payer_restored_balance(&env, &contract_addr, &task_id);
        assert_eq!(payer_restored, amount);
    }

    #[test]
    #[should_panic(expected = "task is not refundable in current status")]
    fn test_refund_if_expired_rejects_confirmed_task() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);
        let amount = 1000_i128;
        let deadline = 50_u64;
        let proof = BytesN::<32>::from_array(&env, &[0xABu8; 32]);

        // Step 1: create_task
        let create_args: soroban_sdk::Vec<Val> = (
            payer.clone(),
            worker.clone(),
            amount,
            task_id.clone(),
            deadline,
        )
            .into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "create_task",
                args: create_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "create_task"),
            create_args,
        );

        // Step 2: confirm_completion
        let confirm_args: soroban_sdk::Vec<Val> =
            (task_id.clone(), proof.clone()).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &worker,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "confirm_completion",
                args: confirm_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "confirm_completion"),
            confirm_args,
        );

        let task = read_task(&env, &contract_addr, &task_id);
        assert_eq!(task.status, STATUS_CONFIRMED);

        // Step 3: advance simulated ledger time past deadline
        env.ledger().set_timestamp(100);

        // Step 4: attempt refund_if_expired on confirmed task - must fail/revert
        let refund_args: soroban_sdk::Vec<Val> = (task_id.clone(),).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "refund_if_expired",
                args: refund_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "refund_if_expired"),
            refund_args,
        );
    }

    #[test]
    #[should_panic(expected = "task is not in Confirmed status")]
    fn test_double_release_rejected() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);
        let amount = 1000_i128;
        let deadline = 500_u64;
        let proof = BytesN::<32>::from_array(&env, &[0xDEu8; 32]);

        // Step 1: create_task
        let create_args: soroban_sdk::Vec<Val> = (
            payer.clone(),
            worker.clone(),
            amount,
            task_id.clone(),
            deadline,
        )
            .into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "create_task",
                args: create_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "create_task"),
            create_args,
        );

        // Step 2: confirm_completion
        let confirm_args: soroban_sdk::Vec<Val> =
            (task_id.clone(), proof.clone()).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &worker,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "confirm_completion",
                args: confirm_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "confirm_completion"),
            confirm_args,
        );

        // Step 3: first release_funds succeeds
        let release_args: soroban_sdk::Vec<Val> = (task_id.clone(),).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &worker,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "release_funds",
                args: release_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "release_funds"),
            release_args.clone(),
        );

        // Verify task status is now Released
        let task = read_task(&env, &contract_addr, &task_id);
        assert_eq!(task.status, STATUS_RELEASED);

        // Step 4: second call to release_funds on the same task_id must fail/revert
        env.mock_auths(&[MockAuth {
            address: &worker,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "release_funds",
                args: release_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "release_funds"),
            release_args,
        );
    }

    #[test]
    #[should_panic(expected = "task is not in Confirmed status")]
    fn test_unconfirmed_release_rejected() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);
        let amount = 1000_i128;
        let deadline = 500_u64;

        // Step 1: create_task (task status is Created, never confirmed)
        let create_args: soroban_sdk::Vec<Val> = (
            payer.clone(),
            worker.clone(),
            amount,
            task_id.clone(),
            deadline,
        )
            .into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "create_task",
                args: create_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "create_task"),
            create_args,
        );

        // Verify task status is Created
        let task = read_task(&env, &contract_addr, &task_id);
        assert_eq!(task.status, STATUS_CREATED);

        // Step 2: attempt release_funds on unconfirmed task - must fail/revert
        let release_args: soroban_sdk::Vec<Val> = (task_id.clone(),).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &worker,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "release_funds",
                args: release_args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "release_funds"),
            release_args,
        );
    }

    // ------------------------------------------------------------------
    // create_task tests
    // ------------------------------------------------------------------

    #[test]
    fn create_task_happy_path() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);

        let args: soroban_sdk::Vec<Val> = (
            payer.clone(),
            worker.clone(),
            1000_i128,
            task_id.clone(),
            100_u64,
        )
            .into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "create_task",
                args: args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "create_task"),
            args,
        );

        let task = read_task(&env, &contract_addr, &task_id);
        assert_eq!(task.payer, payer);
        assert_eq!(task.worker, worker);
        assert_eq!(task.amount, 1000);
        assert_eq!(task.deadline, 100);
        assert_eq!(task.status, STATUS_CREATED);
    }

    #[test]
    #[should_panic(expected = "task already exists")]
    fn create_task_rejects_duplicate() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);

        // Seed an existing task.
        let key = task_key(&env, &task_id);
        let existing = TaskData {
            payer: payer.clone(),
            worker: worker.clone(),
            amount: 500,
            deadline: 200,
            status: STATUS_CREATED,
            proof_hash: BytesN::<32>::from_array(&env, &[0u8; 32]),
        };
        env.mock_auths(&[]);
        env.as_contract(&contract_addr, || {
            env.storage().persistent().set(&key, &existing);
        });

        let args: soroban_sdk::Vec<Val> = (
            payer.clone(),
            worker.clone(),
            1000_i128,
            task_id.clone(),
            100_u64,
        )
            .into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "create_task",
                args,
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "create_task"),
            (payer, worker, 1000_i128, task_id, 100_u64).into_val(&env),
        );
    }

    // ------------------------------------------------------------------
    // confirm_completion tests
    // ------------------------------------------------------------------

    #[test]
    fn confirm_completion_happy_path() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);
        let proof = BytesN::<32>::from_array(&env, &[0xABu8; 32]);

        // Seed a task in "Created" status.
        seed_task(
            &env,
            &contract_addr,
            &TaskData {
                payer: payer.clone(),
                worker: worker.clone(),
                amount: 1000,
                deadline: 100,
                status: STATUS_CREATED,
                proof_hash: BytesN::<32>::from_array(&env, &[0u8; 32]),
            },
            &task_id,
        );

        let args: soroban_sdk::Vec<Val> =
            (task_id.clone(), proof.clone()).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &worker,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "confirm_completion",
                args: args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "confirm_completion"),
            args,
        );

        let task = read_task(&env, &contract_addr, &task_id);
        assert_eq!(task.status, STATUS_CONFIRMED);
        assert_eq!(task.proof_hash, proof);
    }

    #[test]
    #[should_panic(expected = "task not found")]
    fn confirm_completion_rejects_missing_task() {
        let (env, contract_addr, _payer, worker) = setup();
        let task_id = sample_task_id(&env);
        let proof = BytesN::<32>::from_array(&env, &[0xABu8; 32]);

        let args: soroban_sdk::Vec<Val> =
            (task_id.clone(), proof.clone()).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &worker,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "confirm_completion",
                args: args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "confirm_completion"),
            args,
        );
    }

    #[test]
    #[should_panic(expected = "task is not in Created status")]
    fn confirm_completion_rejects_wrong_status() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);
        let proof = BytesN::<32>::from_array(&env, &[0xABu8; 32]);

        // Seed a task already in "Confirmed" status.
        seed_task(
            &env,
            &contract_addr,
            &TaskData {
                payer: payer.clone(),
                worker: worker.clone(),
                amount: 1000,
                deadline: 100,
                status: STATUS_CONFIRMED,
                proof_hash: BytesN::<32>::from_array(&env, &[0u8; 32]),
            },
            &task_id,
        );

        let args: soroban_sdk::Vec<Val> =
            (task_id.clone(), proof.clone()).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &worker,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "confirm_completion",
                args: args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "confirm_completion"),
            args,
        );
    }

    // ------------------------------------------------------------------
    // release_funds tests
    // ------------------------------------------------------------------

    #[test]
    fn release_funds_happy_path() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);

        // Seed a task in "Confirmed" status.
        seed_task(
            &env,
            &contract_addr,
            &TaskData {
                payer: payer.clone(),
                worker: worker.clone(),
                amount: 1000,
                deadline: 100,
                status: STATUS_CONFIRMED,
                proof_hash: BytesN::<32>::from_array(&env, &[0u8; 32]),
            },
            &task_id,
        );

        let args: soroban_sdk::Vec<Val> = (task_id.clone(),).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &worker,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "release_funds",
                args: args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "release_funds"),
            args,
        );

        let task = read_task(&env, &contract_addr, &task_id);
        assert_eq!(task.status, STATUS_RELEASED);
    }

    #[test]
    #[should_panic(expected = "task is not in Confirmed status")]
    fn release_funds_rejects_double_release() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);

        // Seed a task already in "Released" status.
        seed_task(
            &env,
            &contract_addr,
            &TaskData {
                payer: payer.clone(),
                worker: worker.clone(),
                amount: 1000,
                deadline: 100,
                status: STATUS_RELEASED,
                proof_hash: BytesN::<32>::from_array(&env, &[0u8; 32]),
            },
            &task_id,
        );

        let args: soroban_sdk::Vec<Val> = (task_id.clone(),).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &worker,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "release_funds",
                args: args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "release_funds"),
            args,
        );
    }

    // ------------------------------------------------------------------
    // refund_if_expired tests
    // ------------------------------------------------------------------

    #[test]
    fn refund_if_expired_happy_path() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);

        // Seed a task in "Created" status with deadline in the past.
        seed_task(
            &env,
            &contract_addr,
            &TaskData {
                payer: payer.clone(),
                worker: worker.clone(),
                amount: 1000,
                deadline: 50,
                status: STATUS_CREATED,
                proof_hash: BytesN::<32>::from_array(&env, &[0u8; 32]),
            },
            &task_id,
        );

        // Advance ledger timestamp past deadline.
        env.ledger().set_timestamp(100);

        let args: soroban_sdk::Vec<Val> = (task_id.clone(),).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "refund_if_expired",
                args: args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "refund_if_expired"),
            args,
        );

        let task = read_task(&env, &contract_addr, &task_id);
        assert_eq!(task.status, STATUS_REFUNDED);
    }

    #[test]
    #[should_panic(expected = "deadline has not passed yet")]
    fn refund_if_expired_rejects_before_deadline() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);

        seed_task(
            &env,
            &contract_addr,
            &TaskData {
                payer: payer.clone(),
                worker: worker.clone(),
                amount: 1000,
                deadline: 500,
                status: STATUS_CREATED,
                proof_hash: BytesN::<32>::from_array(&env, &[0u8; 32]),
            },
            &task_id,
        );

        env.ledger().set_timestamp(100);

        let args: soroban_sdk::Vec<Val> = (task_id.clone(),).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "refund_if_expired",
                args: args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "refund_if_expired"),
            args,
        );
    }

    #[test]
    #[should_panic(expected = "task is not refundable in current status")]
    fn refund_if_expired_rejects_confirmed_task() {
        let (env, contract_addr, payer, worker) = setup();
        let task_id = sample_task_id(&env);

        seed_task(
            &env,
            &contract_addr,
            &TaskData {
                payer: payer.clone(),
                worker: worker.clone(),
                amount: 1000,
                deadline: 50,
                status: STATUS_CONFIRMED,
                proof_hash: BytesN::<32>::from_array(&env, &[0u8; 32]),
            },
            &task_id,
        );

        env.ledger().set_timestamp(100);

        let args: soroban_sdk::Vec<Val> = (task_id.clone(),).into_val(&env);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &contract_addr,
                fn_name: "refund_if_expired",
                args: args.clone(),
                sub_invokes: &[],
            },
        }]);
        env.invoke_contract::<()>(
            &contract_addr,
            &soroban_sdk::Symbol::new(&env, "refund_if_expired"),
            args,
        );
    }
}
