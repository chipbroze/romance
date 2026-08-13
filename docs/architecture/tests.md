# Test Architecture

This document explains the reasoning behind the test suite structure. For operational
details — where to put files, how to tag tests, how to run them — see
[`tests/README.md`](../../tests/README.md).

## Directory Structure

### Why `unit/` contains both isolated and multi-module tests

The conventional `unit/` vs `integration/` split is often taught as "one module vs.
many modules," but this is not a useful distinction in practice. The axis that actually
matters is **isolation from infrastructure**: does the test require a database, network,
running server, or other external resource to be available?

Tests that wire multiple real in-memory modules together — no mocking, no I/O, no
external services — have no meaningful operational difference from single-module tests.
They run at the same speed, require the same setup (none), and belong in the same
directory. Maintaining two mirrored directory trees for an architectural distinction
that provides no operational payoff adds navigational overhead with no benefit.

The only category that warrants separation is tests that genuinely require a different
runtime environment. For Romance, which has no external services, that means
`tests/system/` for full pipeline tests — not a separate `integration/` tier.

### Why `unit/` mirrors the source tree

The mirrored structure makes the test for any source file immediately findable without
searching or memorizing conventions. `lib/types.js` → `tests/unit/lib/types.test.js`.

The alternative — organizing by feature name, behavior, or subsystem — introduces
naming drift (features get renamed, tests don't), ownership ambiguity (where does a
new behavior for `Profile` go?), and discoverability problems at scale. The source
file is a durable, unambiguous key. Feature names are not.

The mirror is a human navigation aid only. It has no runtime significance and should
never be used as a filtering mechanism.

### Why `system/` tests are organized by user workflow

System tests intentionally have no single source module to point at — they enter the
system at the same point a user does and assert on final output without knowledge of
internals. Organizing them by workflow (`compile-editor.test.js`) is coherent here
precisely because there is no source file to mirror.

## Tagging and Filtering

### Why not separate directories or filename suffixes for slow tests

Using directory structure or filename conventions as runtime filtering logic couples
two concerns that should be independent. A file's location should answer "what does
this test cover?" A tag should answer "how expensive is this test?" These are
orthogonal questions and should be expressed independently.

Filename suffixes like `profile.slow.test.js` also break the mirrored naming system —
now `lib/profile.js` maps to two test files with different names, and the convention
for which tests live where becomes ambiguous.

### Why not inline string tags (`[slow]` in the test name)

String tags in test descriptions pollute the log output, clutter the test name with
metadata that isn't part of the behavior description, and don't scale to multiple
orthogonal dimensions. The options object is the right place for structured metadata.

### Why a `#test` wrapper instead of a Node loader

A Node module loader that silently intercepts `node:test` and replaces it with a
custom implementation would achieve the same result transparently — no import changes
required across test files. This was considered and rejected because silent behavior
modification is difficult to debug and reason about. A test file that appears to import
`node:test` but is silently getting different behavior is a source of confusion,
especially when diagnosing unexpected skip behavior.

The explicit `import { it, describ } from '#test'` makes the mechanism visible and
auditable in every file that uses it. The ergonomic cost of the import is low; the
debugging cost of invisible behavior modification is high.

### Why ESLint enforces the `#test` import

An unenforced convention is a suggestion. The import rule is mechanical and should be
caught mechanically — it frees code reviewers to focus on judgment calls (is this test
actually slow enough to tag?) rather than structural compliance checks. The
`no-restricted-imports` rule with a clear message pointing to the correct import is
sufficient and requires no custom rule infrastructure.

Whether a test warrants `{ slow: true }` cannot be determined statically and is
therefore a code review concern, not a lint rule.

## What "slow" means

Execution cost is orthogonal to test scope. A test can be:

- Fast and single-module (the common case)
- Fast and multi-module (real collaborators wired together, still fast)
- Slow and single-module (computationally expensive pure function)
- Slow and multi-module (full pipeline, large input)

The `slow` tag addresses execution cost only. It does not imply anything about how
many modules are involved or whether the test is "more integration-like." Tag a test
`{ slow: true }` when skipping it meaningfully speeds up the default local test run.
