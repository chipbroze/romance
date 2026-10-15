# Design Doc: Centralized Codec Authoring API

## Status
Proposed

## Goal
Provide an ergonomic, minimalist interface for codec authors, separating the core "Engine" (authoring framework) from the "Library" (pre-defined codecs).

## Architecture

To avoid circular dependencies and API bloat, we split the API into two distinct entry points:

### 1. Engine Layer (`romance/codec-kit`)
This is the core framework. It contains the logic required to define new codecs.
*   **Exports:** `CodecKit`, `type CodecNode`, `type Rom`, `type RuntimeApi`, `type datasize`.
*   **Goal:** Provide the minimal API surface for *authoring*.

### 2. Library Layer (`romance/codecs`)
This is the curated collection of existing codecs and their related types.
*   **Mechanism:** A barrel file (`src/codecs/index.ts`) that exports only the public-facing codec objects and their authoring types.
*   **Goal:** Provide single-path access to all standard codecs for composite authoring.

## Implementation Plan

1.  **Phase 1: Refactor Engine:** Update `src/codec-kit.ts` to export only core framework components.
2.  **Phase 2: Create Registry Barrel:** Create `src/codecs/index.ts` to explicitly export public-facing codec objects (`Uint`, `Struct`, etc.)
3.  **Phase 3: Migration:** Update all codec modules in `src/codecs/` to import dependencies from the Engine layer, and clean up their own internal exports to match the new registry design.
4.  **Phase 4: Cleanup:** Remove legacy helper re-exports and redundant validation bundle imports.

## Benefits
- **Minimalist:** Engine layer remains lightweight and dependency-free.
- **Explicit Dependencies:** Codec-specific types (e.g., `StructArgs`) are accessible without polluting the main engine namespace.
- **Maintainability:** Clear boundary between "How to write a codec" (Engine) and "The standard codec library" (Library).
