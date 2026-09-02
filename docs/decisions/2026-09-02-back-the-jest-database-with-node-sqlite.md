---
status: accepted
---

# Back the Jest Database with `node:sqlite`

`src/core/db/__mocks__/client.ts` — this project's Jest manual mock for
`@/core/db/client` — backs the test database with Node's built-in `node:sqlite`
(`DatabaseSync`), driven through `drizzle-orm/node-sqlite` and its migrator,
replaying this project's own committed migration files. `@libsql/client` and
`better-sqlite3` were both live candidates and lost.

## Why not `@libsql/client`

`@libsql/client` was the reference implementation this pattern was taken from
(`parsable/frontline-worker-client`), so it was the default candidate and had
to be argued against rather than merely passed over.

It adds a dependency carrying a native binary, where `node:sqlite` adds
nothing at all: Node 24 — the major this project's `engines` field already
declares — ships `node:sqlite`, and `drizzle-orm` already ships the
`node-sqlite` driver and migrator this mock uses.

Its in-memory mode is also a trap, not a detail. libSQL's local driver hands
its connection to a transaction and nulls its own, so the next query lazily
opens a *new* connection; against a private `:memory:` database that new
connection sees an empty database, and every query after the first
transaction fails with "no such table". The workaround is
`file::memory:?cache=shared`, but a SQLite shared cache is scoped to the
*process*, and Jest reuses one worker process across many test files — so
every suite in that worker attaches to the same database and rows leak
between test files. Closing the connection does not tear it down; the
reference project had to wipe every table on open to get isolation back.
`node:sqlite`'s `:memory:` database is private to its own connection and has
no such lazy-reconnect behaviour, so isolation between test files falls out
of Jest's own per-file module registry, with nothing to wipe.

## Why not `better-sqlite3`

`better-sqlite3` is what `axross/cunnpe` uses for the same job, so it too was
a live candidate. It needs a native build (`node-gyp`) and two
devDependencies, and buys nothing here that `node:sqlite` does not already
provide.

## What made the choice possible at all

`drizzle-orm` `1.0.0-rc.5`'s Node-side `readMigrationFiles` (in
`migrator.cjs`) reads exactly the layout this project commits —
`<folder>/<timestamp>_<name>/migration.sql`, ordered by directory name, with
the run timestamp parsed from the name's first 14 characters — and throws on
the older `meta/_journal.json` layout instead. That is what lets the test
database run the same SQL a device runs, rather than a second declaration of
the schema that could drift from it.

## What this costs

The record binds the test database to Node's own SQLite. Raising or lowering
the `engines.node` major is now also a decision about the test suite, and
`node:sqlite`'s API is younger than either alternative's.

`tsc` resolves `@/core/db/client` to the real module, so a test sees
`ExpoSQLiteDatabase` types while running against a `node:sqlite` instance.
The query-builder surface the tests use is common to both, but an expo-only
API would typecheck and fail at runtime.

The mock does not close its `DatabaseSync`. This was settled by measurement,
not reasoning: with the mock actually evaluating, full-suite runs grepped for
Jest's "worker process has failed to exit gracefully" warning, and a
`jest --detectOpenHandles` run, both reported nothing.

## What was considered and left alone: the Sparkplug flag

There is an upstream bug in Sparkplug, V8's baseline JIT, that crashes Jest
workers with an intermittent `SIGSEGV` — a *suite* failing while no *test*
fails, with the failing suite moving between runs and passing in isolation.
It is in V8 13.6, which every Node 24.x release ships; it is fixed in Node 25
and not backported. This project runs Node 24, so it is on an affected
build.

It is not a libSQL bug and not a driver bug: the reference project first
misattributed it to `@libsql/client` and later established the attribution
was wrong. It is not, therefore, a reason to prefer or avoid any of the three
candidates considered above, and it has never been observed in this
repository.

The mitigation, if this ever surfaces here, is running Jest as
`node --no-sparkplug ./node_modules/jest/bin/jest.js` — that exact shape is
forced, because the flag is rejected inside `NODE_OPTIONS` and the `jest` bin
shim cannot forward Node flags. It was deliberately not adopted pre-emptively.
