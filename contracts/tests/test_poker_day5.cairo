/// test_poker_day5.cairo — 10 snforge tests for Day 5 poker functions
///
/// Tests:
///   1.  fold() transfers pot to opponent and sets phase = Done
///   2.  fold() in Showdown panics with WRONG_PHASE
///   3.  place_bet() increases pot and records pending_bet
///   4.  place_bet() by a non-player panics with NOT_A_PLAYER
///   5.  call_bet() advances phase to Showdown
///   6.  check + check advances phase to Showdown
///   7.  place_bet after a check resets check_count to 0
///   8.  reveal_hand() by p1 stores hand but stays Showdown
///   9.  both players reveal → settle() fires, pot zeroed, phase Done
///  10.  submit_partial_decrypt() in wrong phase panics with WRONG_PHASE

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

const STRK_FELT: felt252 = 0x1111;
const VERIFIER_FELT: felt252 = 0x2222;
const P1_FELT: felt252 = 0xAAAA;
const P2_FELT: felt252 = 0xBBBB;
const STRANGER_FELT: felt252 = 0xCCCC;

const ANTE_LOW: u128 = 1000000000000000000_u128;
const BET_LOW: u128 = 1000000000000000000_u128;

// ─── Helpers ────────────────────────────────────────────────────────────────

fn setup() -> (ContractAddress, IPokerGameDispatcher) {
    let strk: ContractAddress = STRK_FELT.try_into().unwrap();
    let verifier: ContractAddress = VERIFIER_FELT.try_into().unwrap();

    mock_call(strk, selector!("transfer_from"), true, 9999_u32);
    mock_call(strk, selector!("transfer"), true, 9999_u32);

    let contract = declare("PokerGame").unwrap().contract_class();
    let calldata = array![strk.into(), verifier.into()];
    let (addr, _) = contract.deploy(@calldata).unwrap();
    (addr, IPokerGameDispatcher { contract_address: addr })
}

fn ante() -> u256 {
    u256 { low: ANTE_LOW, high: 0_u128 }
}

fn bet() -> u256 {
    u256 { low: BET_LOW, high: 0_u128 }
}

/// All-zero 416-element deck (simpler than sequential for Day 5 tests).
fn zero_deck() -> Array<felt252> {
    let mut deck: Array<felt252> = array![];
    let mut i: u32 = 0_u32;
    loop {
        if i >= 416_u32 {
            break;
        }
        deck.append(0_felt252);
        i += 1_u32;
    };
    deck
}

fn do_create(addr: ContractAddress, dispatcher: IPokerGameDispatcher) -> felt252 {
    let p1: ContractAddress = P1_FELT.try_into().unwrap();
    start_cheat_caller_address(addr, p1);
    let game_id = dispatcher.create_game(ante());
    stop_cheat_caller_address(addr);
    game_id
}

fn do_create_and_join(addr: ContractAddress, dispatcher: IPokerGameDispatcher) -> felt252 {
    let game_id = do_create(addr, dispatcher);
    let p2: ContractAddress = P2_FELT.try_into().unwrap();
    start_cheat_caller_address(addr, p2);
    dispatcher.join_game(game_id);
    stop_cheat_caller_address(addr);
    game_id
}

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

/// Advance through Shuffling into Playing phase using zero decks.
fn do_get_to_playing(addr: ContractAddress, dispatcher: IPokerGameDispatcher) -> felt252 {
    let game_id = do_register_both_keys(addr, dispatcher);
    let p1: ContractAddress = P1_FELT.try_into().unwrap();
    let p2: ContractAddress = P2_FELT.try_into().unwrap();
    let deck = zero_deck();

    start_cheat_caller_address(addr, p1);
    dispatcher.submit_masked_deck(game_id, deck.span());
    stop_cheat_caller_address(addr);

    start_cheat_caller_address(addr, p2);
    dispatcher.submit_shuffle(game_id, deck.span());
    stop_cheat_caller_address(addr);

    game_id
}

/// Advance into Showdown via double-check.
fn do_get_to_showdown(addr: ContractAddress, dispatcher: IPokerGameDispatcher) -> felt252 {
    let game_id = do_get_to_playing(addr, dispatcher);
    let p1: ContractAddress = P1_FELT.try_into().unwrap();
    let p2: ContractAddress = P2_FELT.try_into().unwrap();

    start_cheat_caller_address(addr, p1);
    dispatcher.check_action(game_id);
    stop_cheat_caller_address(addr);

    start_cheat_caller_address(addr, p2);
    dispatcher.check_action(game_id);
    stop_cheat_caller_address(addr);

    game_id
}

// ─── Tests ────────────────────────────────────────────────────────────────────

/// Test 1: fold() gives entire pot to the opponent and moves to Done.
#[test]
fn test_fold_gives_pot_to_opponent() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();

    let game_id = do_get_to_playing(addr, dispatcher);

    // P1 folds — P2 should receive the pot (mocked transfer succeeds)
    start_cheat_caller_address(addr, p1);
    dispatcher.fold(game_id);
    stop_cheat_caller_address(addr);

    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::Done,
        'Expected Done after fold',
    );
    assert(dispatcher.get_pot(game_id) == 0_u256, 'Pot should be zero after fold');
}

/// Test 2: fold() when the phase is not Playing panics with WRONG_PHASE.
#[test]
#[should_panic(expected: ('WRONG_PHASE',))]
fn test_fold_in_showdown_panics() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();

    let game_id = do_get_to_showdown(addr, dispatcher);

    start_cheat_caller_address(addr, p1);
    dispatcher.fold(game_id); // should panic — already in Showdown
    stop_cheat_caller_address(addr);
}

/// Test 3: place_bet() increases the pot and records pending_bet.
#[test]
fn test_place_bet_increases_pot() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();

    let game_id = do_get_to_playing(addr, dispatcher);
    let before = dispatcher.get_pot(game_id); // ante * 2

    start_cheat_caller_address(addr, p1);
    dispatcher.place_bet(game_id, bet());
    stop_cheat_caller_address(addr);

    assert(dispatcher.get_pot(game_id) == before + bet(), 'Pot should increase by bet');
    assert(dispatcher.get_pending_bet(game_id) == bet(), 'pending_bet mismatch');
}

/// Test 4: place_bet() by an address that is not a player panics with NOT_A_PLAYER.
#[test]
#[should_panic(expected: ('NOT_A_PLAYER',))]
fn test_place_bet_by_nonplayer_panics() {
    let (addr, dispatcher) = setup();
    let stranger: ContractAddress = STRANGER_FELT.try_into().unwrap();

    let game_id = do_get_to_playing(addr, dispatcher);

    start_cheat_caller_address(addr, stranger);
    dispatcher.place_bet(game_id, bet()); // should panic
    stop_cheat_caller_address(addr);
}

/// Test 5: call_bet() matches the pending bet and advances phase to Showdown.
#[test]
fn test_call_bet_advances_to_showdown() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();
    let p2: ContractAddress = P2_FELT.try_into().unwrap();

    let game_id = do_get_to_playing(addr, dispatcher);

    // P1 places a bet
    start_cheat_caller_address(addr, p1);
    dispatcher.place_bet(game_id, bet());
    stop_cheat_caller_address(addr);

    // P2 calls
    start_cheat_caller_address(addr, p2);
    dispatcher.call_bet(game_id);
    stop_cheat_caller_address(addr);

    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::Showdown,
        'Expected Showdown after call',
    );
    assert(dispatcher.get_pending_bet(game_id) == 0_u256, 'pending_bet should clear');
}

/// Test 6: two consecutive check_action() calls advance phase to Showdown.
#[test]
fn test_check_check_advances_to_showdown() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();
    let p2: ContractAddress = P2_FELT.try_into().unwrap();

    let game_id = do_get_to_playing(addr, dispatcher);

    start_cheat_caller_address(addr, p1);
    dispatcher.check_action(game_id);
    stop_cheat_caller_address(addr);

    assert(dispatcher.get_checks(game_id) == 1_u8, 'checks should be 1');
    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::Playing,
        'Still Playing after 1 check',
    );

    start_cheat_caller_address(addr, p2);
    dispatcher.check_action(game_id);
    stop_cheat_caller_address(addr);

    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::Showdown,
        'Expected Showdown after checks',
    );
}

/// Test 7: placing a bet after a check resets check_count to 0.
#[test]
fn test_bet_after_check_resets_check_count() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();
    let p2: ContractAddress = P2_FELT.try_into().unwrap();

    let game_id = do_get_to_playing(addr, dispatcher);

    // P1 checks
    start_cheat_caller_address(addr, p1);
    dispatcher.check_action(game_id);
    stop_cheat_caller_address(addr);

    assert(dispatcher.get_checks(game_id) == 1_u8, 'checks should be 1');

    // P2 bets — should reset check_count
    start_cheat_caller_address(addr, p2);
    dispatcher.place_bet(game_id, bet());
    stop_cheat_caller_address(addr);

    assert(dispatcher.get_checks(game_id) == 0_u8, 'check_count should reset to 0');
    assert(dispatcher.get_pending_bet(game_id) == bet(), 'pending_bet should be set');
    // Phase still Playing (P1 must call or fold)
    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::Playing,
        'Should stay Playing after bet',
    );
}

/// Test 8: one player reveals hand — hand stored, phase stays Showdown.
#[test]
fn test_reveal_hand_p1_only_stays_showdown() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();

    let game_id = do_get_to_showdown(addr, dispatcher);

    start_cheat_caller_address(addr, p1);
    // Pair of 2s: cards 0 (2c) and 13 (2d) share rank 0; rest are distinct
    dispatcher.reveal_hand(game_id, 0_u32, 13_u32, 1_u32, 2_u32, 3_u32);
    stop_cheat_caller_address(addr);

    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::Showdown,
        'Should stay Showdown',
    );
}

/// Test 9: when both players reveal their hands the pot is settled and zeroed.
#[test]
fn test_both_reveal_settles_pot() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();
    let p2: ContractAddress = P2_FELT.try_into().unwrap();

    let game_id = do_get_to_showdown(addr, dispatcher);

    // P1 reveals: four 2s + one 3 (four of a kind)
    start_cheat_caller_address(addr, p1);
    dispatcher.reveal_hand(game_id, 0_u32, 13_u32, 26_u32, 39_u32, 1_u32);
    stop_cheat_caller_address(addr);

    // Phase still Showdown — waiting for P2
    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::Showdown,
        'Still Showdown after p1 reveal',
    );

    // P2 reveals: high-card hand
    start_cheat_caller_address(addr, p2);
    dispatcher.reveal_hand(game_id, 2_u32, 3_u32, 4_u32, 5_u32, 7_u32);
    stop_cheat_caller_address(addr);

    // settle() fired internally
    assert(
        dispatcher.get_game_phase(game_id) == GamePhase::Done,
        'Expected Done after both reveal',
    );
    assert(dispatcher.get_pot(game_id) == 0_u256, 'Pot should be zero after settle');
}

/// Test 10: submit_partial_decrypt() when phase is not Playing panics with WRONG_PHASE.
#[test]
#[should_panic(expected: ('WRONG_PHASE',))]
fn test_submit_pd_wrong_phase_panics() {
    let (addr, dispatcher) = setup();
    let p1: ContractAddress = P1_FELT.try_into().unwrap();

    // Only registered keys — phase is Shuffling, not Playing
    let game_id = do_register_both_keys(addr, dispatcher);

    let pd_x = u256 { low: 0xdeadbeef_u128, high: 0_u128 };
    let pd_y = u256 { low: 0xc0ffee_u128, high: 0_u128 };

    start_cheat_caller_address(addr, p1);
    dispatcher.submit_partial_decrypt(game_id, 0_u32, pd_x, pd_y, array![].span());
    stop_cheat_caller_address(addr);
}
