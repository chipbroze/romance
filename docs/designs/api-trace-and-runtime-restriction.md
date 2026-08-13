# Design Doc: API Trace and Runtime Restriction

## Context
We are preparing for a full separation of "Build" and "Runtime" API contexts. As a prerequisite, we must centralize error trace management within the `Api` object. Originally relying on manual string concatenation in `Item.#try`, this logic has been moved to `Api` to support proper nesting, phase-specific visibility, and native error chaining.

## Goals
*   **Centralize Trace Logic:** Shift error reporting from `Item` to `Api` via a stack-based mechanism using native Error `cause` for chaining.
*   **Interface Filtering:** Provide a restricted view of the `Api` for runtime methods (the "filtered" API) that hides build-only methods.
*   **Decoupled Traversal:** Support both structured traversal (via `Item`) and low-level ROM traversal (via manual ROM frames) while maintaining unified trace enrichment.

## API Changes
The `Api` object provides:
*   **`traceNode(name, type, fn)`**: Manages the stack lifecycle for structural nodes.
*   **`trace(key, value)`**: Appends metadata to the *currently active* structural node.
*   **`formatTrace(message)`**: Reconstructs the full trace stack into a readable string.
*   **`filtered`**: A `Proxy` getter providing a restricted interface for runtime methods.

## Implementation Strategy

### 1. Two-Tier Traversal & Tracing
*   **Structural Traversal (Automatic):** `Item` methods use `Api.execute(label, type, func)` which automatically manages `traceNode` lifecycle, catches exceptions, constructs enriched error messages, and chains the originating error via `cause`.
*   **Low-Level Traversal (Manual):** For fine-grained control (e.g., `Range`, `PointerTable`), developers manage ROM frames directly using `Rom.jsrFrame()` or `Rom.with()`. In these cases, developers manually invoke `Api.trace(key, val)` to enrich the *active* trace node (managed by the parent `Item` context) with relevant runtime metadata (e.g., `index`, `offset`).

### 2. Restricted API ("The Filter")
An `Api.filtered` getter returns a `Proxy` that throws when restricted methods (e.g., `traceNode`, `execute`) are accessed, ensuring runtime type methods cannot manipulate the traversal structure.

### 3. Error Handling
We have moved away from destructive string parsing of error messages. The `Api.execute` method now:
1.  Catches exceptions during traversal.
2.  Formats the error message with the full trace stack.
3.  Throws a new `Error` with the formatted message, attaching the original error as the `cause`.

## Trace Naming
| Method | Visibility | Purpose |
| :--- | :--- | :--- |
| `traceNode(name, type, fn)` | Internal (`Api`) | Manage stack lifecycle |
| `trace(key, value)` | Public (Types) | Add metadata to current context |

