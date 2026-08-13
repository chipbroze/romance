# Design Proposal: Refactor Types Module

## Problem
The `lib/types.js` file has grown significantly and now contains over 1600 lines, making it difficult to maintain and navigate. It mixes core type implementations, helpers, and domain-specific logic.

## Proposed Solution
Split `lib/types.js` into a dedicated `lib/types/` directory with logical modules based on type behavior.

### Taxonomy
- `lib/types/scalars.js`: Basic primitives (`Empty`, `Static`, `Uint`, `HexInt`, `Fixed`, `Bool`, `Enum`, `RefPath`, `Tile`).
- `lib/types/collections.js`: Aggregates (`List`, `SegmentList`, `PointerTable`, `SplitList`, `Bitlist`, `MeltedList`, `Struct`, `Bitfield`, `Bitmask`).
- `lib/types/text.js`: String/Text handling (`TextStr`, `TextScript`, `DTEText`).
- `lib/types/pointers.js`: Pointers and referencing (`Dereference`, `ListIndex`, `Pointer`, `PointerIndex`).
- `lib/types/ops.js`: Operational types (`Range`, `Fork`, `Decorator`, `Decrypter`, `Transformer`, `Maths`, `Custom`).
- `lib/types/utils.js`: Core helpers and abstractions (`Hex`, `Lookup`, `AbstractPassthrough`, `AbstractRead`, `unpackFields`, `rangeGenerator`, `getAtPath`).

## Impact
- **Architecture Documentation:** `docs/architecture/type-system.md` will be updated to reflect the new modular organization.
- **Testing:** The unit tests in `tests/unit/lib/types.test.js` will be split to mirror the new file structure.
- **Compatibility:** `lib/types.js` will be converted to a "barrel" file that re-exports all types to maintain API compatibility for existing consumers.

## Constraints & Integrity
This refactoring must be strictly organizational.

- **Lossless Migration:** All original source code—including comments, TODOs, whitespace, and specific syntax choices—must be preserved exactly as they appeared in the original file.
- **Minimal Changes:** The only permitted changes are adding necessary import statements and restructuring exports.
- **Style Compliance:** New modules must follow the project's 'Concentrated Exports' style guide (export blocks).
- **Scope:** No logic, style, or formatting changes are allowed. The refactoring is limited solely to module separation.
