# Design: Testing Bootstrap (Revised)

## Overview
This document outlines the rollout of the Romance test suite, aligned with the established testing architecture.

## 1. NPM Configuration
Update `package.json` to include granular test execution:

```json
"scripts": {
  "test": "node --test",
  "test:slow": "node --test", 
  "test:fast": "node --test tests/unit/",
  "test:system": "node --test tests/system/"
}
```

## 2. Directory Strategy
*   `tests/fixtures/`: Shared deterministic test inputs (ROMs, YAML schemas).
*   `tests/unit/`: Mirrors the root project structure (e.g., `tests/unit/lib/types.test.js`).
*   `tests/system/`: Workflow-based pipeline tests.
*   `tests/helpers/`: Shared test utilities (factories, global hooks, and the `#test` wrapper).

## 3. Implementation Plan

### Phase 1: Infrastructure
1.  Finalize `tests/helpers/test.js` (the `#test` wrapper).
2.  Update `package.json` scripts.
3.  Confirm ESLint configuration enforces `#test` imports.

### Phase 2: Core Units
1.  Migrate/Implement unit tests in `tests/unit/lib/`, mirroring source paths.
2.  Ensure all imports use `#root/` to avoid backtracking.

### Phase 3: System Tests
1.  Implement full pipeline round-trip tests in `tests/system/`.
2.  Use workflow-based naming (e.g., `tests/system/import-export.test.js`).
3.  Utilize `tests/fixtures/` for shared data and `__fixtures__/` for test-specific data.

## 4. Guidelines
*   Use `#test` for all `it`/`describe` blocks.
*   Tag expensive tests with `{ slow: true }` in `it()`.
*   Ensure regression tests are added for all new bugs.
