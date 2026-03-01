/// hand_eval.cairo — 5-card poker hand evaluator in pure Cairo
///
/// Card encoding: card index i → rank = i % 13, suit = i / 13
///   ranks: 0=2, 1=3, 2=4, 3=5, 4=6, 5=7, 6=8, 7=9, 8=T, 9=J, 10=Q, 11=K, 12=A
///   suits: 0=clubs, 1=diamonds, 2=hearts, 3=spades
///
/// Hand ranks returned by evaluate_hand:
///   0 = high card
///   1 = pair
///   2 = two pair
///   3 = three of a kind
///   4 = straight
///   5 = flush
///   6 = full house
///   7 = four of a kind
///   8 = straight flush

/// Evaluate a 5-card hand.  Cards are given as deck indices (0-51).
/// Returns the hand rank (0-8) as defined above.
pub fn evaluate_hand(c0: u32, c1: u32, c2: u32, c3: u32, c4: u32) -> u8 {
    // Decompose into ranks (0-12) and suits (0-3)
    let r0 = c0 % 13_u32;
    let r1 = c1 % 13_u32;
    let r2 = c2 % 13_u32;
    let r3 = c3 % 13_u32;
    let r4 = c4 % 13_u32;

    let s0 = c0 / 13_u32;
    let s1 = c1 / 13_u32;
    let s2 = c2 / 13_u32;
    let s3 = c3 / 13_u32;
    let s4 = c4 / 13_u32;

    let flush = s0 == s1 && s1 == s2 && s2 == s3 && s3 == s4;
    let straight = is_straight(r0, r1, r2, r3, r4);

    if flush && straight {
        return 8_u8;
    }

    let (pairs, has_trips, has_quads) = rank_patterns(r0, r1, r2, r3, r4);

    if has_quads {
        return 7_u8;
    }
    if has_trips && pairs == 1_u8 {
        return 6_u8;
    }
    if flush {
        return 5_u8;
    }
    if straight {
        return 4_u8;
    }
    if has_trips {
        return 3_u8;
    }
    if pairs == 2_u8 {
        return 2_u8;
    }
    if pairs == 1_u8 {
        return 1_u8;
    }
    0_u8
}

/// Composite hand score for comparison: (hand_rank × 14^5) + kicker encoding.
/// Sufficient for determining the winner in a showdown.
/// Larger number is a better hand.
pub fn hand_score(c0: u32, c1: u32, c2: u32, c3: u32, c4: u32) -> u32 {
    let rank = evaluate_hand(c0, c1, c2, c3, c4);
    let r0 = c0 % 13_u32;
    let r1 = c1 % 13_u32;
    let r2 = c2 % 13_u32;
    let r3 = c3 % 13_u32;
    let r4 = c4 % 13_u32;
    // Hand tier dominates; within a tier use max rank as primary kicker
    let max_r = max5(r0, r1, r2, r3, r4);
    let sum_r = r0 + r1 + r2 + r3 + r4;
    (rank.into()) * 10000_u32 + max_r * 100_u32 + sum_r
}

// ─── Private helpers ─────────────────────────────────────────────────────────

/// Count how many cards in {r0..r4} equal `rank`.
fn count_rank(r0: u32, r1: u32, r2: u32, r3: u32, r4: u32, rank: u32) -> u8 {
    let mut c: u8 = 0_u8;
    if r0 == rank {
        c += 1_u8;
    }
    if r1 == rank {
        c += 1_u8;
    }
    if r2 == rank {
        c += 1_u8;
    }
    if r3 == rank {
        c += 1_u8;
    }
    if r4 == rank {
        c += 1_u8;
    }
    c
}

/// Minimum of five u32 values.
fn min5(a: u32, b: u32, c: u32, d: u32, e: u32) -> u32 {
    let ab = if a < b { a } else { b };
    let cd = if c < d { c } else { d };
    let abcd = if ab < cd { ab } else { cd };
    if abcd < e { abcd } else { e }
}

/// Maximum of five u32 values.
fn max5(a: u32, b: u32, c: u32, d: u32, e: u32) -> u32 {
    let ab = if a > b { a } else { b };
    let cd = if c > d { c } else { d };
    let abcd = if ab > cd { ab } else { cd };
    if abcd > e { abcd } else { e }
}

/// True if the five ranks form a straight (including ace-low A-2-3-4-5).
fn is_straight(r0: u32, r1: u32, r2: u32, r3: u32, r4: u32) -> bool {
    let min = min5(r0, r1, r2, r3, r4);
    let max = max5(r0, r1, r2, r3, r4);

    if max - min == 4_u32 {
        // All five consecutive ranks present (max - min == 4 + no duplicates)
        return count_rank(r0, r1, r2, r3, r4, min) == 1_u8
            && count_rank(r0, r1, r2, r3, r4, min + 1_u32) == 1_u8
            && count_rank(r0, r1, r2, r3, r4, min + 2_u32) == 1_u8
            && count_rank(r0, r1, r2, r3, r4, min + 3_u32) == 1_u8
            && count_rank(r0, r1, r2, r3, r4, min + 4_u32) == 1_u8;
    }

    // Ace-low straight: A(12)-2(0)-3(1)-4(2)-5(3)
    if min == 0_u32 && max == 12_u32 {
        return count_rank(r0, r1, r2, r3, r4, 0_u32) == 1_u8
            && count_rank(r0, r1, r2, r3, r4, 1_u32) == 1_u8
            && count_rank(r0, r1, r2, r3, r4, 2_u32) == 1_u8
            && count_rank(r0, r1, r2, r3, r4, 3_u32) == 1_u8
            && count_rank(r0, r1, r2, r3, r4, 12_u32) == 1_u8;
    }

    false
}

/// Returns (pair_count, has_three_of_a_kind, has_four_of_a_kind)
fn rank_patterns(r0: u32, r1: u32, r2: u32, r3: u32, r4: u32) -> (u8, bool, bool) {
    let mut pairs: u8 = 0_u8;
    let mut has_trips = false;
    let mut has_quads = false;

    let mut r: u32 = 0_u32;
    loop {
        if r >= 13_u32 {
            break;
        }
        let c = count_rank(r0, r1, r2, r3, r4, r);
        if c == 2_u8 {
            pairs += 1_u8;
        }
        if c == 3_u8 {
            has_trips = true;
        }
        if c == 4_u8 {
            has_quads = true;
        }
        r += 1_u32;
    };

    (pairs, has_trips, has_quads)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::{evaluate_hand, hand_score};

    #[test]
    fn test_high_card() {
        // 2c 4d 6h 8s Tc → ranks 0,2,4,6,8 all different suits
        assert(evaluate_hand(0, 14, 28, 42, 8) == 0, 'Expected high card');
    }

    #[test]
    fn test_pair() {
        // Two 2s + three unrelated
        assert(evaluate_hand(0, 13, 1, 2, 3) == 1, 'Expected pair');
    }

    #[test]
    fn test_flush() {
        // 5 cards all clubs (suit 0): 2c(0) 4c(2) 6c(4) 8c(6) Tc(8)
        assert(evaluate_hand(0, 2, 4, 6, 8) == 5, 'Expected flush');
    }

    #[test]
    fn test_straight() {
        // 2c 3d 4h 5s 6c → ranks 0,1,2,3,4 different suits
        assert(evaluate_hand(0, 14, 28, 42, 4) == 4, 'Expected straight');
    }

    #[test]
    fn test_four_of_a_kind() {
        // Four 2s + one 3: indices 0(2c),13(2d),26(2h),39(2s),1(3c)
        assert(evaluate_hand(0, 13, 26, 39, 1) == 7, 'Expected four of kind');
    }
}
