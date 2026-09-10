#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, BytesN, Env};

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
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
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

    fn read_task(env: &Env, contract_addr: &Address, task_id: &BytesN<32>) -> TaskData {
        let key = task_key(env, task_id);
        env.as_contract(contract_addr, || {
            env.storage()
                .persistent()
                .get(&key)
                .expect("task should exist")
        })
    }

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
}
