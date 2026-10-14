# Design Document: Directory Structure Reorganization (`src/`)

## 1. Goals & Motivation

As Romance matures into a robust bidirectional binary serialization framework and library, structuring the codebase for clear modularity, separation of concerns, and ergonomic public API consumption is critical. 

The current directory structure under `src/` places core engine modules, file management, error handling, and utility helpers together inside `src/lib/`. While effective during initial TypeScript migration, this flat library layout conflates core execution mechanics with general utility helpers and lacks explicit, curated entrypoints for programmatic library consumers and custom codec authors.

### Key Objectives:
1. **Architectural Alignment:** Mirror the architectural layers defined in `docs/architecture/overview.md` (`CLI -> Romance -> Project -> Engine -> Type Graph`) within the directory hierarchy.
2. **Clear Module Categorization:** Separate core execution framework modules (`src/core/`), domain-specific binary codecs (`src/codecs/`), and general-purpose support utilities (`src/utils/`).
3. **Curated Public API Boundaries:** Provide a primary library entrypoint (`src/index.ts`) for embedding Romance programmatically and a secondary entrypoint (`src/codec-kit.ts`) for authoring custom codecs.
4. **Resilience & Maintainability:** Minimize circular dependencies, simplify import paths, and establish clear boundaries between public APIs and internal framework mechanics.

---

## 2. Proposed Directory Tree under `src/`

```text
src/
├── index.ts                 # Primary library entrypoint (Romance API & public types)
├── codec-kit.ts             # Secondary entrypoint for custom codec authoring (CodecKit, TypeNode, etc.)
├── cli.ts                   # CLI entrypoint and command line interface logic
├── core/                    # Core framework execution and project orchestration
│   ├── engine.ts            # Execution engine (decode, encode, parse, format, validation)
│   ├── errors.ts            # Core error definitions and aggregate handlers
│   ├── file-formats.ts      # Workspace file format handlers (JSON, YAML, etc.)
│   ├── overrides.ts         # TODO: Delete
│   ├── project.ts           # Project resource repository & engine factory
|   ├── romance.ts           # Romance orchestrator / high-level API implementation
│   ├── rom.ts               # ROM binary data handling and size descriptors
│   ├── schema-graph.ts      # Declarative schema compilation into type graphs
│   ├── type-registry.ts     # Master type registry and CodecKit definitions. TODO: Rename to codec-registry.ts
│   └── types.ts             # Core type definitions and structural interfaces
├── codecs/                  # Standard binary codec implementations
│   ├── collections.ts       # List, Struct, SegmentList, Bitfield, etc.
│   ├── ops.ts               # Fork, Modifier, View, Custom, Script, Resolver
│   ├── pointers.ts          # Pointer, PointerTable, Dereference, ListIndex
│   ├── scalars.ts           # Uint, Empty, Static, Tile
│   ├── text.ts              # TextStr, TextScript
│   ├── utils.ts             # Codec-specific validation and hex helpers. TODO: Rename to helpers.ts to avoid semantic collision with top utils/ directory
│   └── valibot.ts           # Valibot integration and schema helpers
└── utils/                   # General cross-cutting infrastructure helpers
    ├── assert.ts            # Assertion utilities
    ├── fs.ts                # File system I/O helpers
    ├── log.ts               # Logging and output alignment helpers
    ├── map-utils.ts         # EvilMap and advanced map collection helpers
    └── transform.ts         # Data transformation utilities
```

*(Note: In the final tree, `assert.ts` moves to `src/utils/` along with `map-utils.ts`, `log.ts`, and `fs.ts`, as they are general helper libraries rather than core framework execution modules.)*

---

## 3. Module Categorization & Responsibilities

### A. Entrypoints
*   **`src/index.ts` (Primary Entrypoint):** Serves as the main programmatic library interface for external consumers embedding Romance. Exports `Romance` and essential project/engine configuration types.
*   **`src/codec-kit.ts` (Secondary Entrypoint):** Dedicated entrypoint for custom codec authors. Exports `CodecKit`, `TypeNode`, `RomanceTypeInstance`, and validation primitives without exposing internal engine execution guts.
*   **`src/cli.ts`:** Command-line interface wrapper handling argument parsing, command dispatching, help generation, and CLI feedback.

### B. Core (`src/core/`)
Houses core framework execution and orchestration logic:
*   **`engine.ts`:** Orchestrates schema traversal during decode, encode, parse, format, and validation pipelines.
*   **`project.ts`:** Manages project resource repositories (schemas, custom types, hooks, profiles) and constructs configured engines.
*   **`schema-graph.ts`:** Compiles declarative user schemas into an executable type graph.
*   **`type-registry.ts`:** Provides `CodecKit` definitions, registry scoping, and type lookup infrastructure.
*   **`rom.ts`:** Handles ROM binary buffers, data sizes (`byte`, `word`, `long`, etc.), and byte-length calculations.
*   **`romance.ts`:** Implements the core `Romance` class responsible for manifest parsing, project instantiation, ROM loading/saving, and workspace dump/import orchestration.
*   **`file-formats.ts`:** Manages serialization formats (JSON, YAML) used for workspace dumps and imports.
*   **`errors.ts`:** Defines framework-specific error classes.
*   **`types.ts`:** Core structural and type definitions.

### C. Codecs (`src/codecs/`)
Contains domain-specific binary serialization codecs:
*   **`scalars.ts`:** Numeric integers (`Uint`), static blocks (`Static`), empty blocks (`Empty`), and tile graphics (`Tile`).
*   **`collections.ts`:** Structured data (`Struct`), arrays (`List`), bitfields (`Bitfield`), and segmented/split lists.
*   **`pointers.ts`:** Pointer resolution, pointer tables, and dereferencing.
*   **`text.ts`:** String encoding/decoding and text scripts.
*   **`ops.ts`:** Complex operational nodes (`Fork`, `Modifier`, `View`, `Custom`, `Script`, `Resolver`).
*   **`valibot.ts`:** Integration with Valibot for validation schemas.
*   **`utils.ts`:** Helper utilities for codec argument validation and hex formatting.

### D. Utils / Support (`src/utils/`)
General helper libraries that are not strictly core framework execution modules:
*   **`map-utils.ts`:** Custom `EvilMap` collection implementation.
*   **`log.ts`:** Text alignment and formatting helpers (`align`).
*   **`assert.ts`:** Assertion and invariant checking functions.
*   **`fs.ts`:** Safe file system operations (`safeImport`, `readDir`, `writeDir`, `safeRead`, `writePath`).
*   **`transform.ts`:** Handles data transformation pipelines.

---

## 4. Public API Boundaries & Export Strategy

### Primary Library Export (`src/index.ts`)
```typescript
export { Romance } from './romance.js';
```

### Codec Authoring Export (`src/codec-kit.ts`)
```typescript
export { CodecKit, TypeNode } from './core/type-registry.js';
export type { RomanceTypeInstance, datasize } from './core/type-registry.js';
```

### Encapsulation Rules
*   Internal core modules (`schema-graph.ts`, `overrides.ts`, `transform.ts`, `file-formats.ts`, `rom.ts`) remain internal to `src/core/` and are not exported by the top-level library entrypoint.
*   General utilities in `src/utils/` are internal support libraries unless explicitly required by public extension APIs.

---

## 5. Migration Plan / Phases

### Phase 1: Establish Utils Layer (`src/utils/`)
- Create `src/utils/` directory.
- Move general helper modules (`map-utils.ts`, `log.ts`, `assert.ts`, `fs.ts`, `transform.ts`) from `src/lib/` to `src/utils/`.
- Update all relative imports across the codebase pointing to these utility modules.

### Phase 2: Rename & Reorganize Core (`src/lib/` -> `src/core/`)
- Rename `src/lib/` directory to `src/core/`.
- Verify all core modules (`engine.ts`, `project.ts`, `schema-graph.ts`, `type-registry.ts`, `rom.ts`, `file-formats.ts`, `transform.ts`, `errors.ts`, `types.ts`, `overrides.ts`) reside inside `src/core/`.
- Update internal import statements across core files, codecs, `romance.ts`, and tests.

### Phase 3: Implement Entrypoints (`src/index.ts` & `src/codec-kit.ts`)
- Create `src/index.ts` defining the primary library export surface.
- Create `src/codec-kit.ts` defining the secondary codec authoring entrypoint.
- Move `src/romance.ts` into `src/core/` as it is no longer the entrypoint.
- Update `package.json` entrypoint mappings (`main`, `exports`, etc.) as appropriate.

### Phase 4: Verification & Testing
- Run `npm test` and `npm run test:slow` to verify all unit, system, and CLI roundtrip tests pass successfully.
- Verify TypeScript compilation produces correct artifacts in `dist/`.
