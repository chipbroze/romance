# Test Suite

All automated tests for the Romance engine. See [`docs/architecture/tests.md`](../docs/architecture/tests.md) for the reasoning behind these decisions.

## Structure

```
tests/
├── unit/         # all in-memory tests, mirroring the root project structure
├── system/       # full pipeline tests from the user's perspective
├── fixtures/     # shared, reusable test data
└── helpers/      # shared test utilities, the #test wrapper, factories
```

## Writing Tests

### Imports

Always import from `#test`, never from `node:test` directly. ESLint enforces this.
The `#root` import is provided to avoid `../..` backtracking from test paths.

```js
import { it, describe } from '#test'
import { RefPath } from '#root/lib/types.js'
```

### Where does my test file go?

- **In-memory behavior** (isolated or multi-module, including filesystem I/O): `tests/unit/`, mirroring the source path.
  `lib/types.js` → `tests/unit/lib/types.test.js`
- **Full pipeline from a user entrypoint**: `tests/system/`

### Where do fixtures go?

- Used by one test file → `__fixtures__/` subdirectory next to that test file.
  Prefix the filename with the owning test: `types.expired-token.json`
- Used by more than one test file → `tests/fixtures/`
- Data that needs to vary across cases → factory function in `tests/helpers/factories.js`

Treat fixture files as immutable. If a test needs to mutate state, copy the fixture
to a unique `/tmp` subdirectory and clean up in an `after()` hook.

### Helpers

```
tests/helpers/
├── test.js        # #test wrapper — import this, not node:test
├── factories.js   # factory functions for test data
└── setup.js       # global before/after hooks
```

## Tagging

Pass `{ slow: true }` to any `it` that is meaningfully expensive. Tags go on `it`,
never on `describe`.

```js
describe('SchemaGraph', () => {
  describe('resolve()', () => {
    it('returns cached type on second lookup', () => { ... })
    it('builds full inheritance chain on first resolve', { slow: true }, () => { ... })
  })
})
```

## Running Tests

```
npm test              # all tests, slow ones skipped
npm run test:slow     # all tests including slow
npm run test:fast     # unit tests only, slow skipped
npm run test:system   # system tests only
```

## Guidelines

- Name test files `<subject>.test.js`. No abbreviations.
- Always write a regression test for a bug before fixing it.
- Prefer `it()` descriptions that complete the sentence "it should...".
