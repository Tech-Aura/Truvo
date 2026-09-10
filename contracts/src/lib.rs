#![no_std]
use soroban_sdk::{contract, contractimpl};

#[contract]
pub struct TruvoContract;

#[contractimpl]
impl TruvoContract {
    // Contract methods will be implemented here.
}

#[cfg(test)]
mod test {
    use soroban_sdk::Env;

    #[test]
    fn test_skeleton() {
        let _env = Env::default();
    }
}

