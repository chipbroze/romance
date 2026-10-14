# Design Document: Codec Semantics Migration (`Type` -> `Codec`)

## 1. Motivation & Goals

As Romance has evolved into a robust bidirectional binary serialization framework, precision in terminology has become paramount. Currently, the codebase mixes legacy nomenclature (`Type`, `types`, `RomanceType`, `RomanceTypeInstance`, `TypeRegistry`, `MasterTypeRegistry`, `type-registry.ts`) with modern architecture documentation and concepts (`Codec`, `CodecKit`, Codec System).

### Key Drivers & Objectives:
1. **Disambiguation from TypeScript Types:** The word "type" is heavily overloaded in TypeScript (`type` keyword, type annotations, type guards, conditional types, mapped types, compiler diagnostics). Using `Type`, `RomanceType`, and `type-registry` alongside TypeScript's native type system causes constant cognitive dissonance, naming collisions (e.g., local variables named `type` shadowing TypeScript keywords or types), and ambiguity in code reviews.
2. **Domain Alignment:** Romance schemas are composed of **Codecs** (`RomanceCodec`, `CodecInstance`, `CodecRegistry`) responsible for bidirectional binary serialization (decode/encode) and human-readable representation transformation (format/parse). Aligning code identifiers with domain terminology directly reflects architectural intent.
3. **Architectural Consistency:** Core architectural documentation (`docs/architecture/type-system.md`) already refers to the subsystem as the **Codec System**. This migration harmonizes implementation semantics with architecture specs.

---

## 2. Comprehensive Mapping Table

The following table outlines the exact mapping from legacy terminology to the new codec semantics across files, types, interfaces, functions, variables, and error messages.

### A. Filenames
| Legacy Filename | New Filename | Description |
| --- | --- | --- |
| `src/core/type-registry.ts` | `src/core/codec-registry.ts` | Master codec registry, `CodecKit`, and registry infrastructure |
| `src/core/types.ts` | `src/core/codecs.ts` | Re-export barrel for standard native codecs |
| `tests/unit/core/type-registry.test.js` | `tests/unit/core/codec-registry.test.js` | Unit tests for codec registry behavior |
| `tests/helpers/type-test.js` | `tests/helpers/codec-test.js` | Test helpers for codec testing |

### B. Types & Interfaces
| Legacy Name | New Name | Description |
| --- | --- | --- |
| `RomanceType` | `RomanceCodec` | Union type of `SimpleCodec \| CompositeCodec` |
| `RomanceTypeInstance` | `CodecInstance` | Runtime serialization/deserialization instance object (`decode`, `encode`, `format`, `parse`) |
| `TypeRegistry` | `CodecRegistry` | Runtime registry managing registered codecs |
| `MasterTypeRegistry` | `MasterCodecRegistry` | TypeScript module augmentation interface for global codec registry |
| `AnyRomanceType` | `AnyRomanceCodec` | Any simple or composite codec |
| `RomanceTypeError` | `RomanceCodecError` | Framework error class for codec-related failures |
| `TypeNode` | `CodecNode` (Abstract Base Class) | Abstract base class for schema execution nodes |
| `TypeRegistry extends object` (generic constraint) | `CodecRegistry extends object` | Generic type constraint for compilation registries |

### C. Functions, Variables, Properties, and Error Messages
| Legacy Identifier / Text | New Identifier / Text | Scope / Location |
| --- | --- | --- |
| `#types` (Map) | `#codecs` | `CodecRegistry` class in `codec-registry.ts` |
| `#getType()` | `#getCodec()` | `SchemaGraph` and `CodecRegistry` |
| `extra_types` | `extra_codecs` | `CodecRegistry` constructor parameter |
| `all_types` | `all_codecs` | Local collection variable in registry initialization |
| `romance_type` | `romance_codec` | Iteration variable during validation |
| `Invalid Type: Expected object definition` | `Invalid Codec: Expected object definition` | `assertRomanceCodec` error message |
| `Invalid Type: Expected "alias" to be type: string` | `Invalid Codec: Expected "alias" to be of type string` | `assertRomanceCodec` error message |
| `Invalid Type "${alias}": Missing "construct" function` | `Invalid Codec "${alias}": Missing "construct" function` | `assertRomanceCodec` error message |
| `Invalid or unregistered type identifier:` | `Invalid or unregistered codec identifier:` | `SchemaGraph` error message |
| `assertRomanceType` (if any) / `assertRomanceCodec` | `assertRomanceCodec` | Assertion helper function |

---

## 3. Phased Implementation Plan

### Phase 1: Filename Renames & Import Updates
- **Step 1.1**: Rename `src/core/type-registry.ts` to `src/core/codec-registry.ts`.
- **Step 1.2**: Rename `src/core/types.ts` to `src/core/codecs.ts` (or update imports accordingly).
- **Step 1.3**: Rename test files:
  - `tests/unit/core/type-registry.test.js` -> `tests/unit/core/codec-registry.test.js`
  - `tests/helpers/type-test.js` -> `tests/helpers/codec-test.js`
- **Step 1.4**: Update all import and export statements across `src/core/`, `src/codecs/`, `src/codec-kit.ts`, and `tests/` pointing to the renamed files.

### Phase 2: Core Types, Interfaces, & Class Renames
- **Step 2.1**: In `src/core/codec-registry.ts`, rename types and interfaces:
  - `RomanceType` -> `RomanceCodec`
  - `RomanceTypeInstance` -> `CodecInstance`
  - `TypeRegistry` -> `CodecRegistry`
  - `MasterTypeRegistry` -> `MasterCodecRegistry`
  - `AnyRomanceType` -> `AnyRomanceCodec`
- **Step 2.2**: Rename abstract base class `TypeNode` to `CodecNode`.
- **Step 2.3**: Update module augmentation declarations across all codec modules (`src/codecs/scalars.ts`, `src/codecs/collections.ts`, `src/codecs/text.ts`, `src/codecs/pointers.ts`, `src/codecs/ops.ts`, etc.) from `MasterTypeRegistry` to `MasterCodecRegistry`.

### Phase 3: Error Handling, Helper Functions, & Internal Properties
- **Step 3.1**: In `src/core/errors.ts`, rename `RomanceTypeError` to `RomanceCodecError`.
- **Step 3.2**: Update internal registry property `#types` to `#codecs`, lookup method `#getType()` to `#getCodec()`, and local variables (`extra_types` -> `extra_codecs`, `all_types` -> `all_codecs`, `romance_type` -> `romance_codec`).
- **Step 3.3**: Update error messages and assertion function text ("Invalid Type" -> "Invalid Codec").
- **Step 3.4**: Update references in `src/core/schema-graph.ts`, `src/core/engine.ts`, `src/core/project.ts`, and `src/codec-kit.ts`.

### Phase 4: Test Suite & Documentation Updates
- **Step 4.1**: Update `tests/unit/core/codec-registry.test.js`, `tests/unit/core/engine.test.js`, and `tests/helpers/codec-test.js` to use `CodecRegistry`, `RomanceCodec`, etc.
- **Step 4.2**: Update architecture documentation (`docs/architecture/type-system.md`, `docs/architecture/schema-system.md`) and design documents (`docs/designs/codec-architecture-migration.md`, `docs/designs/directory-reorganization.md`) to reflect `Codec` semantics.

### Phase 5: Full Verification & Type-Checking
- **Step 5.1**: Run TypeScript type-checking (`npx tsc --noEmit` or build) to verify 0 compilation errors.
- **Step 5.2**: Run unit tests and system tests (`npm test`) to ensure 100% behavioral parity and test coverage.
