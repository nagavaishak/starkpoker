/// pot_manager.cairo — STRK escrow primitives for StarkPoker
///
/// Defines:
///   - IERC20: minimal ERC20 interface used to pull/push STRK
///   - STRK_MAINNET_ADDRESS: well-known STRK token address on Starknet mainnet
///   - FORFEIT_TIMEOUT_SECS: inactivity window before opponent can claim the pot
///
/// The PokerGame contract embeds pot management in its own storage.
/// These helpers keep the STRK transfer logic readable and reusable.

use starknet::ContractAddress;

// ─── Constants ────────────────────────────────────────────────────────────────

/// STRK token address on Starknet mainnet/testnet (ERC20, 18 decimals).
pub const STRK_MAINNET_ADDRESS: felt252 =
    0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d;

/// If no game action is recorded for this many seconds the opponent
/// may call `claim_forfeit` to collect the entire pot.
pub const FORFEIT_TIMEOUT_SECS: u64 = 3600_u64; // 1 hour

// ─── IERC20 ──────────────────────────────────────────────────────────────────

/// Minimal ERC20 interface — only the functions PokerGame needs.
#[starknet::interface]
pub trait IERC20<TContractState> {
    /// Transfer `amount` tokens from the caller to `recipient`.
    fn transfer(
        ref self: TContractState,
        recipient: ContractAddress,
        amount: u256,
    ) -> bool;

    /// Transfer `amount` tokens from `sender` to `recipient`.
    /// Requires that the caller has been approved for at least `amount`.
    fn transfer_from(
        ref self: TContractState,
        sender: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) -> bool;

    /// Return the token balance of `account`.
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
}

// ─── Transfer helpers ────────────────────────────────────────────────────────

/// Pull `amount` STRK from `from` into `to` (typically the game contract).
/// Panics if the ERC20 transfer_from returns false.
pub fn pull_strk(
    token: ContractAddress,
    from: ContractAddress,
    to: ContractAddress,
    amount: u256,
) {
    let erc20 = IERC20Dispatcher { contract_address: token };
    let ok = erc20.transfer_from(from, to, amount);
    assert(ok, 'STRK_PULL_FAILED');
}

/// Push `amount` STRK from the game contract to `to` (winner / refund).
/// Panics if the ERC20 transfer returns false.
pub fn push_strk(token: ContractAddress, to: ContractAddress, amount: u256) {
    let erc20 = IERC20Dispatcher { contract_address: token };
    let ok = erc20.transfer(to, amount);
    assert(ok, 'STRK_PUSH_FAILED');
}
