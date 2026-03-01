/// test_poker_game.cairo — 8 snforge tests for PokerGame state machine
///
/// Tests:
///   1. create_game sets WaitingForPlayer2 phase
///   2. join_game advances phase to RegisteringKeys
///   3. register_public_key by player1 sets keys_registered bit 0
///   4. both players register → phase advances to Shuffling
///   5. submit_masked_deck by player1 advances shuffle_step to 1
///   6. submit_shuffle by player2 advances phase to Playing
///   7. join_game by player1 (self-play) panics with CANNOT_PLAY_SELF
///   8. submit_masked_deck by player2 panics with ONLY_PLAYER1

use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
    mock_call,
};
use starknet::ContractAddress;
use starkpoker_contracts::poker_game::{
    IPokerGameDispatcher, IPokerGameDispatcherTrait, GamePhase,
};

// ─── Constants ─────────────────────────────────────────────────────────────

/// Fake STRK token — ERC20 calls are mocked via snforge mock_call.
const STRK_FELT: felt252 = 0x1111;
/// Fake Garaga verifier — not called in Day 4 tests.
const VERIFIER_FELT: felt252 = 0x2222;
/// Test addresses
const P1_FELT: felt252 = 0xAAAA;
const P2_FELT: felt252 = 0xBBBB;
/// 1 STRK in 18-decimal units
const ANTE_LOW: u128 = 1000000000000000000_u128;
const ANTE_HIGH: u128 = 0_u128;

// ─── Helpers ────────────────────────────────────────────────────────────────

/// Deploy PokerGame and mock STRK ERC20 calls so no real token is needed.
fn setup() -> (ContractAddress, IPokerGameDispatcher) {
    let strk: ContractAddress = STRK_FELT.try_into().unwrap();
    let verifier: ContractAddress = VERIFIER_FELT.try_into().unwrap();

    // Mock transfer_from and transfer on the fake STRK address
    mock_call(strk, selector!("transfer_from"), true, 9999_u32);
    mock_call(strk, selector!("transfer"), true, 9999_u32);

    let contract = declare("PokerGame").unwrap().contract_class();
    let calldata = array![strk.into(), verifier.into()];
    let (addr, _) = contract.deploy(@calldata).unwrap();

    (addr, IPokerGameDispatcher { contract_address: addr })
}

/// Return the test ante as u256.
fn ante() -> u256 {
    u256 { low: ANTE_LOW, high: ANTE_HIGH }
}

/// Create a 416-element dummy deck (sequential felt252 values).
fn dummy_deck() -> Array<felt252> {
    let mut deck: Array<felt252> = array![];
    let mut i: u32 = 0_u32;
    loop {
        if i >= 416_u32 {
            break;
        }
        deck.append(i.into());
        i += 1_u32;
    };
    deck
}

/// Create a game as P1 and return the game_id.
fn do_create(addr: ContractAddress, dispatcher: IPokerGameDispatcher) -> felt252 {
    let p1: ContractAddress = P1_FELT.try_into().unwrap();
    start_cheat_caller_address(addr, p1);
    let game_id = dispatcher.create_game(ante());
    stop_cheat_caller_address(addr);
    game_id
}

/// Join as P2 and return game_id (calls do_create internally).
fn do_create_and_join(addr: ContractAddress, dispatcher: IPokerGameDispatcher) -> felt252 {
    let game_id = do_create(addr, dispatcher);
    let p2: ContractAddress = P2_FELT.try_into().unwrap();
    start_cheat_caller_address(addr, p2);
    dispatcher.join_game(game_id);
    stop_cheat_caller_address(addr);
    game_id
}

/// Register both public keys and return game_id.
fn do_register_both_keys(addr: ContractAddress, dispatcher: IPokerGameDispatcher) -> felt252 {
    let game_id = do_create_and_join(addr, dispatcher);
    let p1: ContractAddress = P1_FELT.try_into().unwrap();
    let p2: ContractAddress = P2_FELT.try_into().unwrap();

    let pk_x = u256 { low: 0x1234567890abcdef_u128, high: 0_u128 };
    let pk_y = u256 { low: 0xfedcba9876543210_u128, high: 0_u128 };

    start_cheat_caller_address(addr, p1);
    dispatcher.register_public_key(game_id, pk_x, pk_y);
    stop_cheat_caller_address(addr);

    start_cheat_caller_address(addr, p2);
    dispatcher.register_public_key(game_id, pk_x, pk_y);
    stop_cheat_caller_address(addr);

    game_id
}

// ─── Tests ────────────────────────────────────────────────────────────────────

/// Test 1: create_game stores player1, ante, and sets WaitingForPlayer2.
#[test]
fn test_create_game_sets_phase() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();

    let game_id = do_create(addr, dispatcher);

    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::WaitingForPlayer2,
        'Expected WaitingForPlayer2',
    );
    assert(dispatcher.get_player1(game_id) == p1, 'Wrong player1 address');
    assert(dispatcher.get_pot(game_id) == ante(), 'Wrong pot after create');
}

/// Test 2: join_game sets player2 and advances to RegisteringKeys.
#[test]
fn test_join_game_advances_phase() {
    let (addr, dispatcher) = setup();
    let p2: ContractAddress = P2_FELT.try_into().unwrap();

    let game_id = do_create_and_join(addr, dispatcher);

    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::RegisteringKeys,
        'Expected RegisteringKeys',
    );
    assert(dispatcher.get_player2(game_id) == p2, 'Wrong player2 address');
    assert(dispatcher.get_pot(game_id) == ante() * 2_u256, 'Wrong pot after join');
}

/// Test 3: register_public_key by player1 sets bit 0 of keys_registered.
#[test]
fn test_register_pk_player1_sets_bit() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();

    let game_id = do_create_and_join(addr, dispatcher);
    let pk_x = u256 { low: 0xdeadbeef_u128, high: 0_u128 };
    let pk_y = u256 { low: 0xc0ffee_u128, high: 0_u128 };

    start_cheat_caller_address(addr, p1);
    dispatcher.register_public_key(game_id, pk_x, pk_y);
    stop_cheat_caller_address(addr);

    assert(dispatcher.get_keys_registered(game_id) == 1_u8, 'Bit 0 should be set');
    assert(dispatcher.get_pk_x(game_id, p1) == pk_x, 'pk_x mismatch');
    assert(dispatcher.get_pk_y(game_id, p1) == pk_y, 'pk_y mismatch');
    // Still RegisteringKeys — waiting for player2
    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::RegisteringKeys,
        'Should still be RegisteringKeys',
    );
}

/// Test 4: both players register → phase advances to Shuffling.
#[test]
fn test_both_keys_registered_advances_to_shuffling() {
    let (addr, dispatcher) = setup();

    let game_id = do_register_both_keys(addr, dispatcher);

    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::Shuffling,
        'Expected Shuffling',
    );
    assert(dispatcher.get_keys_registered(game_id) == 3_u8, 'Both bits should be set');
}

/// Test 5: submit_masked_deck by player1 stores deck and sets shuffle_step = 1.
#[test]
fn test_submit_deck_by_player1() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();

    let game_id = do_register_both_keys(addr, dispatcher);
    let deck = dummy_deck();

    start_cheat_caller_address(addr, p1);
    dispatcher.submit_masked_deck(game_id, deck.span());
    stop_cheat_caller_address(addr);

    assert(dispatcher.get_shuffle_step(game_id) == 1_u8, 'shuffle_step should be 1');
    // Phase should still be Shuffling (waiting for player2)
    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::Shuffling,
        'Should still be Shuffling',
    );
    // Spot-check deck storage
    assert(dispatcher.get_deck_felt(game_id, 0_u32) == 0, 'deck[0] mismatch');
    assert(dispatcher.get_deck_felt(game_id, 415_u32) == 415, 'deck[415] mismatch');
}

/// Test 6: submit_shuffle by player2 overwrites deck and advances to Playing.
#[test]
fn test_submit_shuffle_advances_to_playing() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();
    let p2: ContractAddress = P2_FELT.try_into().unwrap();

    let game_id = do_register_both_keys(addr, dispatcher);
    let deck1 = dummy_deck();

    // Player1 submits initial deck
    start_cheat_caller_address(addr, p1);
    dispatcher.submit_masked_deck(game_id, deck1.span());
    stop_cheat_caller_address(addr);

    // Player2 reshuffles (different values — reversed sequential for testing)
    let mut deck2: Array<felt252> = array![];
    let mut i: u32 = 0_u32;
    loop {
        if i >= 416_u32 {
            break;
        }
        deck2.append((1000_u32 + i).into());
        i += 1_u32;
    };

    start_cheat_caller_address(addr, p2);
    dispatcher.submit_shuffle(game_id, deck2.span());
    stop_cheat_caller_address(addr);

    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::Playing,
        'Expected Playing phase',
    );
    assert(dispatcher.get_shuffle_step(game_id) == 2_u8, 'shuffle_step should be 2');
    // Deck should now contain player2's values
    assert(dispatcher.get_deck_felt(game_id, 0_u32) == 1000, 'deck[0] should be p2 value');
}

/// Test 7: player1 trying to join their own game panics with CANNOT_PLAY_SELF.
#[test]
#[should_panic(expected: ('CANNOT_PLAY_SELF',))]
fn test_join_own_game_panics() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();

    let game_id = do_create(addr, dispatcher);

    start_cheat_caller_address(addr, p1);
    dispatcher.join_game(game_id); // should panic
    stop_cheat_caller_address(addr);
}

/// Test 8: player2 calling submit_masked_deck (which is player1-only) panics.
#[test]
#[should_panic(expected: ('ONLY_PLAYER1',))]
fn test_submit_deck_by_wrong_player_panics() {
    let (addr, dispatcher) = setup();
    let p2: ContractAddress = P2_FELT.try_into().unwrap();

    let game_id = do_register_both_keys(addr, dispatcher);
    let deck = dummy_deck();

    // Player2 attempts to submit the initial deck — should be player1 only
    start_cheat_caller_address(addr, p2);
    dispatcher.submit_masked_deck(game_id, deck.span()); // should panic
    stop_cheat_caller_address(addr);
}
