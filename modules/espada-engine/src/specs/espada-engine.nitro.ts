import type { HybridObject } from 'react-native-nitro-modules';

/**
 * a job's outcome, passed to `start`'s `onSettled` callback. mirrors
 * `EspadaStatus` (`../../lib/espada-engine/src/ffi.rs`) and `EspadaStatus`
 * (`../../lib/bridge/espada_engine.h`) value for value — this declaration is the one
 * place that numeric contract is authored; Nitrogen generates the matching
 * C++ `enum class` from it rather than it being mirrored by hand across
 * TypeScript, C++ and Rust.
 */
export enum EspadaJobStatus {
  Success = 0,
  Cancelled = 1,
  Error = 2,
}

/**
 * an equity job's outcome, passed to `startEquity`'s `onSettled` callback.
 * mirrors `EspadaEquityStatus` (`../../lib/espada-engine/src/equity_ffi.rs`)
 * value for value — the same "declared once in TypeScript, generated
 * everywhere else" contract `EspadaJobStatus` follows, extended with two
 * outcomes only an equity job can reach.
 *
 * `Success`/`Cancelled`/`Error` share `EspadaJobStatus`'s own discriminants
 * on purpose, but this is a distinct enum: an equity job's `onSettled` never
 * carries an `EspadaJobStatus`, so a caller cannot mix the two job kinds up
 * by forgetting which status type a given callback expects.
 */
export enum EspadaEquityJobStatus {
  Success = 0,
  Cancelled = 1,
  Error = 2,
  /**
   * every player's range looked individually valid against the board, but
   * no single deal of the whole deck can give every player a live holding
   * at once — three players each pinned to `AA` is the standing example,
   * since only four aces exist. reported distinctly rather than folded into
   * `Error`, since it is a genuine result of evaluating the input, not a
   * fault.
   */
  NoValidRunout = 3,
  /**
   * `players` named a count outside the two- or three-player table the
   * native evaluator supports (see `startEquity`'s own comment). reported
   * distinctly rather than as `Error` so a caller can recognize it without
   * parsing `message`.
   */
  UnsupportedPlayerCount = 4,
}

/**
 * one of a hand-range player's own live card pairs, carried by
 * `EspadaEquityPlayerResult.pairs` — a card pair overlapping the board, or
 * with no live opponent combo ever consistent with it, carries no entry at
 * all (see that field's own doc comment). mirrors
 * `EspadaEquityCardPairResult` (`../../lib/espada-engine/src/equity_ffi.rs`)
 * field for field, dequantized back to a plain `[0, 1]` fraction here — the
 * 16-bit fixed-point wire representation the native layer crosses the C ABI
 * with is an internal detail of staying under that boundary's per-tick size
 * budget, not part of this spec's own contract.
 *
 * `cardA`/`cardB` are each a card index in `0..52`: `rank * 4 + suit`, rank
 * ordered `Ace..Deuce` and suit ordered `Spade, Heart, Diamond, Club` — the
 * same encoding the native layer uses internally, restated here since nothing
 * else in this module exports it. `cardA <= cardB`.
 *
 * `equity` is this one pair's own equity accumulated so far — the same
 * `share() / total()` ratio `distribution` below already bins, carried here
 * per pair instead of folded into a bin count.
 *
 * `strength` is this pair's current strength: the product of this player's
 * own pairwise lead against every opponent still live against it, `1` — a
 * neutral factor — standing in for an opponent this pair leaves no live
 * combo against (see
 * `docs/decisions/2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md`).
 * fixed for the life of one calculation — computed lazily, on first read, by
 * whichever worker thread reaches it first, and held constant across every
 * tick after that, unlike `equity` above. preflop (`board` is `""`), current
 * strength has no board to
 * be ahead on and is left undefined by design: `strength` is `0` for every
 * pair of a preflop result, a sentinel rather than a measurement — a preflop
 * consumer must classify by `equity` alone and never read this field.
 */
export interface EspadaEquityCardPairResult {
  cardA: number;
  cardB: number;
  equity: number;
  strength: number;
}

/**
 * one player's aggregate equity over the whole runout walk, carried by
 * `startEquity`'s `onProgress` and `onSettled` callbacks alike — present in
 * `onSettled` only when `status` is `EspadaEquityJobStatus.Success`, and in
 * `onProgress` only once every player has accumulated some data as of that
 * tick (see `startEquity`'s own comment below). mirrors
 * `EspadaEquityPlayerResult` (`../../lib/espada-engine/src/equity_ffi.rs`)
 * field for field.
 *
 * `win`, `tie`, and `equity` are each a fraction in `[0, 1]`: `win` and
 * `tie` are the share of opponent-combination weight this player's range
 * wins outright or splits; `equity` is the pot-share equity a split
 * correctly fractions, so it is not simply `win + tie` — a three-way split
 * contributes a third of `tie` to `equity`, not half (see the Rust type's
 * own doc comment for the full derivation).
 *
 * `distribution` is that same walk's second, coarser accounting: a
 * fixed-length array of 20 counts — the Rust side's own
 * `EQUITY_DISTRIBUTION_BIN_COUNT`
 * (`../../lib/espada-engine/src/equity_ffi.rs`), matching the Equity
 * Breakdown sheet's histogram's own existing 20-bin placeholder shape
 * (`../../../src/features/evaluations/model/equity-breakdown.ts`'s
 * `EQUITY_BIN_COUNTS[0]`) — one per equal-width slice of the same
 * `0..=100` equity axis, each counting how many of this player's own card
 * pairs landed in that slice by that one pair's own equity. sums to this
 * player's own total live card-pair count once this is a settled `Success`
 * result; on a progress tick, a card pair no completed shard has yet
 * touched contributes to no bin yet, so the sum can run below that total
 * until settlement (see the Rust type's own doc comment for the full
 * derivation, including how a card pair landing exactly on a bin boundary
 * is resolved).
 *
 * `pairs` carries this same player's own live card pairs individually
 * rather than folded into either accounting above — present on every
 * progress tick and the settled result alike, wherever this player itself is
 * present (see `EspadaEquityCardPairResult`'s own doc comment for what each
 * element carries, and for a card pair's exclusion and neutral-factor
 * rules).
 */
export interface EspadaEquityPlayerResult {
  win: number;
  tie: number;
  equity: number;
  distribution: number[];
  pairs: EspadaEquityCardPairResult[];
}

/**
 * the Nitro `HybridObject` this module registers as `EspadaEngine`. Nitrogen
 * generates its C++ spec base class (`HybridEspadaEngineSpec`, under
 * `nitrogen/generated/shared/c++/`) from this interface, the registration for
 * both platforms, and the autolinking files the podspec, Gradle build and
 * CMake build consume — see `../../lib/bridge/EspadaEngineHybridObject.hpp` for the
 * hand-written subclass that implements it and calls into the Rust C ABI.
 */
export interface EspadaEngine extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  /**
   * starts a job counting primes below `limit` (clamped to
   * `[0, UINT64_MAX]`), sharded across `threadCount` Rust-owned worker
   * threads (`0` = every available core, clamped rather than rejected — see
   * `espada_engine.h`). both numbers cross from JS as `double`, per this
   * project's own "numbers cross as f64" rule.
   *
   * `onProgress` fires at a bounded rate with a `[0, 1]` completion
   * fraction. `onSettled` fires exactly once with the job's outcome:
   * `result` is meaningful only when `status` is `EspadaJobStatus.Success`;
   * `message` is present only when `status` is `EspadaJobStatus.Error`.
   *
   * starting a second job while one is already running releases the
   * previous handle first (see `release()`) rather than rejecting — the
   * previous job's worker threads keep running to their own completion
   * regardless, per the C ABI's own free-while-running contract.
   */
  start(
    limit: number,
    threadCount: number,
    onProgress: (progress: number) => void,
    onSettled: (status: EspadaJobStatus, result: number, message: string | undefined) => void,
  ): void;

  /**
   * requests cancellation of the running job, if any. a no-op if no job is
   * running. does not block; the job still settles through `onSettled`.
   */
  cancel(): void;

  /**
   * releases the current job handle, if any. safe to call more than once,
   * safe to call whether or not the job has settled.
   */
  release(): void;

  /**
   * starts a job computing real equity for a table of players, sharded
   * across `threadCount` Rust-owned worker threads (`0` = every available
   * core, clamped rather than rejected — see `espada_engine.h`).
   * `threadCount` crosses from JS as `double`, per this project's own
   * "numbers cross as f64" rule.
   *
   * `board` is a space-separated list of card codes (e.g. `"Ah Kd 2c"`)
   * naming 0 (preflop), or 3, 4, or 5 (postflop) known board cards; pass
   * `""` for preflop, never omit it.
   *
   * `players` is one hand-range string per player (e.g. `"AA"`,
   * `"22+,A2s+,AJo+"`), in seat order. deliberately not constrained to two
   * or three entries by this method's own type: whether a table of this
   * size is supported is for the native evaluator to decide, not this
   * spec — see `EspadaEquityJobStatus.UnsupportedPlayerCount`'s own doc
   * comment for why that check is reported through `onSettled` rather than
   * being validated here or by the caller ahead of time.
   *
   * `onProgress` fires at a bounded rate with a `[0, 1]` completion
   * fraction, alongside each player's own currently-accumulated result:
   * `players` is present only once the engine has accumulated at least
   * some data for every player as of that tick (`undefined` otherwise —
   * an early tick where even one player has nothing accumulated yet never
   * carries a partial array), in the same seat order as the `players`
   * argument above. `onSettled` fires exactly once with the job's outcome:
   * `results` is present only when `status` is
   * `EspadaEquityJobStatus.Success`; `message` is present only when
   * `status` is `EspadaEquityJobStatus.Error`. an unparseable `board` or
   * range string throws synchronously instead of ever reaching
   * `onSettled` — see the native layer's own comment on why that case
   * alone cannot be reported through the callback.
   *
   * a distinct job from the one `start`/`cancel`/`release` above manage:
   * starting an equity job does not affect a running demo job, and starting
   * a second equity job while one is already running releases the previous
   * handle first (see `releaseEquity()`) rather than rejecting, the same
   * "previous job's worker threads keep running to their own completion"
   * contract `start()` documents above.
   */
  startEquity(
    board: string,
    players: string[],
    threadCount: number,
    onProgress: (progress: number, players: EspadaEquityPlayerResult[] | undefined) => void,
    onSettled: (
      status: EspadaEquityJobStatus,
      results: EspadaEquityPlayerResult[] | undefined,
      message: string | undefined,
    ) => void,
  ): void;

  /**
   * requests cancellation of the running equity job, if any. a no-op if no
   * equity job is running. does not block; the job still settles through
   * `startEquity`'s own `onSettled`.
   */
  cancelEquity(): void;

  /**
   * releases the current equity job handle, if any. safe to call more than
   * once, safe to call whether or not the job has settled.
   */
  releaseEquity(): void;
}
