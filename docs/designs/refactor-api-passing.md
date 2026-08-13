# Design Doc: Refactoring API Dependency Injection

## Context
The previous implementation tightly coupled the `api` object to both the graph compilation phase and the runtime phase. This created ambiguity regarding which methods were available during which phase, specifically allowing runtime-only methods (like `fetch`, `transform`) to be accessed during graph compilation.

## Goal
Enforce a clean separation of concerns between compilation and runtime phases via distinct API surfaces.

- **Compilation Phase:**
  - Must have access to `item()` for building the schema graph.
  - Must NOT have access to runtime-only methods (`fetch`, `transform`, `lib`).
- **Runtime Phase:**
  - Must have access to `lib`, `fetch`, `transform`.
  - Must ALSO have access to `item()` to support ephemeral node creation during execution.

## Architectural Changes

1. **`SchemaGraph`:**
   - Owns the compilation lifecycle.
   - Exposes `compile_api`, containing exclusively `item()`.
   - Passes `compile_api` to `Type` constructors during graph building.

2. **`GraphRuntime`:**
   - Manages the execution context.
   - Combines `session_api` (`lib`, `fetch`, `transform`) with `schema_graph.compile_api.item`.
   - Injected into runtime methods (`decode`, `encode`, `format`, `parse`).

3. **Invariants:**
   - Verify that `Type` constructors cannot access `fetch`, `transform`, or `lib`.
   - Verify that runtime methods have access to the full combined API.

## Verification
- Audit Type constructors to ensure they only access `item()`.
- Audit runtime methods to ensure they have access to `item()`, `fetch`, `transform`, and `lib`.
