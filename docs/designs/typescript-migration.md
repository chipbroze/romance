# TypeScript Migration Plan (Romance)

## Overview

This document defines a staged migration plan to convert the Romance
codebase from JavaScript to TypeScript while preserving behavior,
minimizing risk, and keeping changes incremental and reversible.

The goal is not just “adding TypeScript,” but transitioning the
project into a modern Node.js library structure with:

- clear source vs build separation
- explicit module boundaries
- maintainable type-safe core
- unchanged runtime behavior during migration

---

## Guiding Principles

1. Behavior must not change during migration
2. Each step must be independently verifiable
3. Avoid large-scale refactors during initial TS introduction
4. Prefer incremental adoption over “big bang” rewrite
5. Keep tests decoupled from TypeScript initially
6. dist/ is a build artifact, not a working directory
7. OpenCode-assisted conversion should be file-by-file

---

## Target Architecture (Post-Migration)

```
src/
  cli.ts
  romance.ts
  lib/
tests/
docs/
dist/
```

---

## Output structure

```
dist/
  cli.js
  romance.js
  lib/
```

---

## Phase 0 — Pre-Migration Snapshot

### Goals
- Establish baseline behavior

### Tasks
- Run full test suite
- Tag commit:

```
git tag pre-ts-migration
```

---

## Phase 1 — Introduce TypeScript Tooling

### Install dependencies

```
npm install --save-dev typescript
```

(Optional later: tsx, test runner updates)

---

### Initialize config

```
npx tsc --init
```

---

### Update tsconfig.json

Initial configuration:

```
{
  "compilerOptions": {
    "allowJs": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",

    "rootDir": "src",
    "outDir": "dist",

    "strict": true,

    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

---

## Phase 2 — Restructure Project Layout

### Move all runtime code into src/

#### Move operations:

- lib/ → src/lib/
- cli.js → src/cli.ts
- romance.js → src/romance.ts

### Keep unchanged:

- tests/
- docs/

### Result:

```
src/
  cli.ts
  romance.ts
  lib/
```

* Ensure package.json is updated given these new paths

---

## Phase 3 — First Successful TypeScript Build

### Objective
Achieve a clean compilation without changing runtime behavior.

### Command:

```
npx tsc
```

### Expected output:

```
dist/
  cli.js
  romance.js
  lib/
```

### Validation:

- Test suite 100% passes

---

## Phase 4 — Incremental File Conversion

### Strategy

Convert files one at a time:

1. Start with leaf modules (utilities)
2. Then core domain modules (lib)
3. Then API layer
4. Then CLI/romance entry points

---

### Conversion workflow per file:

1. Rename .js → .ts
2. Run tsc
3. Fix type errors
4. Run tests
5. Commit

---

## Phase 5 — Test Strategy (Deferred TypeScript Integration)

### Initial state

- tests remain JavaScript
- tests run against compiled output (dist/ or source depending on current setup)

### Goal

Avoid coupling test migration with production migration.

### Optional future improvements:

- migrate tests to TS
- introduce tsx or vitest
- add dual-mode testing (src vs dist)

---

## Phase 6 — Cleanup Migration Artifacts

Once fully converted:

### Remove:

- allowJs (optional)
- any JS-only fallback paths
- temporary compatibility shims

### Ensure:

- entire src/ is TypeScript
- no runtime JS source files remain

---

## Phase 7 — Optional Enhancements (Post-Migration)

- introduce tsx for dev runtime
- introduce bundler (only if needed)
- migrate tests to TypeScript
- add CI type-check step
- improve strictness (noImplicitAny, etc.)
- refactor architecture into clearer modules

---

## Risk Management

### Primary risks:

- accidental behavioral changes during conversion
- type over-engineering during migration
- mixing refactors with type conversion
- build configuration drift

### Mitigations:

- one file at a time conversion
- continuous test execution
- no structural refactoring during Phase 4
- commit after every successful file migration

---

## Success Criteria

Migration is complete when:

- entire runtime codebase is TypeScript
- tsc builds cleanly with strict mode enabled
- dist/ is the only runtime artifact
- CLI runs from compiled output
- tests pass unchanged
- no .js runtime source files remain in src/

---

## Notes

This migration is intentionally conservative.

The goal is not to modernize everything at once, but to:

- establish TypeScript as the source of truth
- preserve system behavior
- avoid architectural instability during transition

Once complete, Romance will be positioned for deeper architectural
refinement (schema typing, plugin interfaces, and runtime contracts).
