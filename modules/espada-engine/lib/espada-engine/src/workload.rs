//! The demo workload: counting primes below a limit by trial division.
//!
//! This carries no product meaning. It exists to prove Rust code can run off
//! the JavaScript thread; the counting logic here is deliberately simple and
//! carries no dependency of its own.

/// The number of contiguous shards a job's range is split into, fixed
/// independently of the thread count so the total is identical no matter how
/// many worker threads pull shards off the cursor.
pub const SHARD_COUNT: u64 = 256;

/// Returns whether `n` is prime, by trial division up to `sqrt(n)` skipping
/// even candidates (the standard 6k +/- 1 wheel).
pub fn is_prime(n: u64) -> bool {
    if n < 2 {
        return false;
    }
    if n.is_multiple_of(2) {
        return n == 2;
    }
    if n.is_multiple_of(3) {
        return n == 3;
    }
    let mut divisor = 5u64;
    while divisor * divisor <= n {
        if n.is_multiple_of(divisor) || n.is_multiple_of(divisor + 2) {
            return false;
        }
        divisor += 6;
    }
    true
}

/// Counts the primes in `[start, end)`.
pub fn count_primes_in_range(start: u64, end: u64) -> u64 {
    let start = start.max(2);
    if start >= end {
        return 0;
    }
    (start..end).filter(|&n| is_prime(n)).count() as u64
}

/// Returns the half-open `[start, end)` bounds of shard `shard_index` out of
/// `shard_count` contiguous shards partitioning `[0, limit)`.
///
/// The partition is exact: summing `end - start` over every shard index in
/// `0..shard_count` always yields `limit`, with no gap and no overlap,
/// regardless of how `limit` and `shard_count` relate to one another.
pub fn shard_bounds(shard_index: u64, shard_count: u64, limit: u64) -> (u64, u64) {
    if shard_count == 0 {
        return (0, 0);
    }
    let shard_size = limit.div_ceil(shard_count);
    if shard_size == 0 {
        return (0, 0);
    }
    let start = (shard_index * shard_size).min(limit);
    let end = ((shard_index + 1) * shard_size).min(limit);
    (start, end)
}

/// Only compiled into `cargo test` builds: a limit value reserved to make a
/// job's worker threads panic immediately, so the panic-handling path can be
/// exercised through the real `extern "C"` `espada_engine_start` signature
/// without any shared mutable test state (which would race across the
/// concurrently-run `#[test]` functions that each start their own job).
///
/// This does not exist in the shipped `cdylib`/`staticlib` at all, so it is
/// not a production footgun.
#[cfg(test)]
pub(crate) const TEST_FORCE_PANIC_LIMIT: u64 = u64::MAX;

/// The demo workload's chosen `N`: on this host (an Intel Xeon @ 2.10GHz,
/// `nproc` 4), a release build takes ~3.0s single-threaded and ~1.0s across
/// 4 threads — see the crate's verification receipt for the exact
/// measurements. A phone's cores are generally slower per-thread than this
/// host's, so this is expected (not verified on real hardware, which this
/// environment has none of) to land in the target one-to-three second range.
/// Cross-validated against an independent Sieve of Eratosthenes in this
/// module's own tests, since it is otherwise too large to eyeball or trust
/// from memory the way the two externally-supplied reference values are.
#[cfg(test)]
pub(crate) const DEMO_LIMIT: u64 = 20_000_000;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_prime_matches_known_values() {
        assert!(!is_prime(0));
        assert!(!is_prime(1));
        assert!(is_prime(2));
        assert!(is_prime(3));
        assert!(!is_prime(4));
        assert!(is_prime(5));
        assert!(!is_prime(9));
        assert!(is_prime(97));
        assert!(!is_prime(100));
        assert!(is_prime(104_729)); // the 10,000th prime
        assert!(!is_prime(104_730));
    }

    #[test]
    fn count_primes_matches_known_reference_values() {
        // These are the reference values the crate's C ABI tests also assert
        // against for whichever N is chosen as the demo workload's limit.
        assert_eq!(count_primes_in_range(0, 1_000_000), 78_498);
        assert_eq!(count_primes_in_range(0, 2_000_000), 148_933);
    }

    #[test]
    fn count_primes_handles_degenerate_ranges() {
        assert_eq!(count_primes_in_range(0, 0), 0);
        assert_eq!(count_primes_in_range(0, 1), 0);
        assert_eq!(count_primes_in_range(0, 2), 0);
        assert_eq!(count_primes_in_range(0, 3), 1);
        assert_eq!(count_primes_in_range(5, 5), 0);
        assert_eq!(count_primes_in_range(10, 5), 0);
    }

    fn sum_via_shards(limit: u64, shard_count: u64) -> u64 {
        (0..shard_count)
            .map(|i| {
                let (start, end) = shard_bounds(i, shard_count, limit);
                count_primes_in_range(start, end)
            })
            .sum()
    }

    #[test]
    fn shard_bounds_partition_exactly_covers_the_range() {
        for &limit in &[0u64, 1, 2, 10, 100, 255, 256, 257, 1000, 10_000] {
            for &shard_count in &[1u64, 2, 3, 7, SHARD_COUNT] {
                let mut covered = 0u64;
                let mut previous_end = 0u64;
                for i in 0..shard_count {
                    let (start, end) = shard_bounds(i, shard_count, limit);
                    assert!(
                        start <= end,
                        "shard {i} of {shard_count} for limit {limit} has start > end"
                    );
                    assert_eq!(
                        start, previous_end,
                        "shard {i} of {shard_count} for limit {limit} leaves a gap or overlap"
                    );
                    previous_end = end;
                    covered += end - start;
                }
                assert_eq!(
                    previous_end, limit,
                    "shards for limit {limit} don't reach the limit"
                );
                assert_eq!(
                    covered, limit,
                    "shards for limit {limit} don't sum to the limit"
                );
            }
        }
    }

    #[test]
    fn sharded_count_matches_unsharded_count_at_several_shard_counts() {
        for &limit in &[0u64, 1, 2, 1000, 12_345] {
            let reference = count_primes_in_range(0, limit);
            for &shard_count in &[1u64, 2, 5, SHARD_COUNT] {
                assert_eq!(
                    sum_via_shards(limit, shard_count),
                    reference,
                    "limit {limit} shard_count {shard_count} diverged from the unsharded count"
                );
            }
        }
    }

    /// A Sieve of Eratosthenes, independent of the trial-division algorithm
    /// under test, used only to cross-validate [`DEMO_LIMIT`]'s reference
    /// value below — that value is otherwise too large to eyeball or to
    /// trust from memory the way the two externally-supplied reference
    /// points above can be.
    fn count_primes_by_sieve(limit: u64) -> u64 {
        let limit = limit as usize;
        if limit < 2 {
            return 0;
        }
        let mut is_composite = vec![false; limit];
        let mut count = 0u64;
        for n in 2..limit {
            if !is_composite[n] {
                count += 1;
                if let Some(square) = n.checked_mul(n) {
                    let mut m = square;
                    while m < limit {
                        is_composite[m] = true;
                        m += n;
                    }
                }
            }
        }
        count
    }

    #[test]
    fn sieve_matches_the_two_known_reference_values() {
        // Establishes that the sieve itself is trustworthy before using it
        // to validate a value with no external reference to check against.
        assert_eq!(count_primes_by_sieve(1_000_000), 78_498);
        assert_eq!(count_primes_by_sieve(2_000_000), 148_933);
    }

    #[test]
    fn trial_division_matches_the_sieve_at_the_chosen_demo_limit() {
        assert_eq!(
            count_primes_in_range(0, DEMO_LIMIT),
            count_primes_by_sieve(DEMO_LIMIT)
        );
    }
}
