# Design Proposal: Expanding Type System Test Coverage

## Problem
The current test coverage for the type system is minimal, primarily focusing on `Uint`. To ensure the robustness of the serialization and human-readable formatting pipelines, we need comprehensive, standardized tests for all type implementations across both serialization paths.

## Strategy
We will implement a two-tier testing approach for every type:

1.  **Binary Roundtrip (`decode`/`encode`)**:
    *   Verify that `Internal Data -> Binary -> Internal Data` is lossless.
    *   Verify that `Binary -> Internal Data -> Binary` is lossless.

2.  **Human-Readable Roundtrip (`parse`/`format`)**:
    *   Verify that `Internal Data -> Editable -> Internal Data` is lossless.
    *   Verify that `Editable -> Internal Data -> Editable` is lossless.

## Testing Architecture
To minimize boilerplate and ensure consistency, we will develop a helper library:

- **`tests/helpers/type-test.js`**:
    - `assertRoundtrip(type, data, rom)`: Validates binary serialization.
    - `assertHumanRoundtrip(type, data)`: Validates format/parse cycle.
    - `assertError(type, invalidData)`: Validates expected failures/invariants.

## Execution Plan
We will implement these tests in phases, iterating on the helper library as we identify shared patterns.

- **Phase 1: Scalars** (`lib/types/scalars.js`) **COMPLETED**
    - `Empty`, `Static`, `Uint`, `HexInt`, `Fixed`, `Bool`, `Enum`, `Tile`.
- **Phase 2: Collections** (`lib/types/collections.js`) **PENDING**
    - `List`, `SegmentList`, `Struct`, `Bitfield`, etc.
- **Phase 3: Text & Pointers** (`lib/types/text.js`, `lib/types/pointers.js`)
- **Phase 4: Operations** (`lib/types/ops.js`)

## Goal
Establish a standardized test suite that allows for easy verification of type integrity while simplifying the creation of new tests through abstraction.
