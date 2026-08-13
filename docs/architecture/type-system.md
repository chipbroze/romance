# Type System

## Overview

Types are the fundamental building blocks of Romance schemas.

A type is responsible for translating between an external representation and an internal representation.

Types participate in two independent serialization pipelines:

```text
ROM <-> Internal Data
```

and

```text
Editable Data <-> Internal Data
```

This is achieved through four primary operations:

```js
decode()
encode()

format()
parse()
```

---

## Internal Data

Every type defines an internal representation.

Examples:

| Type   | Internal Representation |
| ------ | ----------------------- |
| UInt8  | number                  |
| String | string                  |
| Struct | object                  |
| List   | array                   |
| Enum   | string or number        |

The internal representation is the canonical form used throughout the engine.

---

## Binary Operations

### decode()

Converts binary data into internal data.

```text
ROM -> Internal Data
```

### encode()

Converts internal data into binary data.

```text
Internal Data -> ROM
```

A valid type should support lossless decode/encode round-trips.

---

## Human-Readable Operations

### format()

Converts internal data into a human-readable representation.

```text
Internal Data -> Editable Data
```

### parse()

Converts editable data into internal data.

```text
Editable Data -> Internal Data
```

A valid type should support lossless format/parse round-trips.

---

## Composition

Types may contain other types.

Examples:

* Struct
* List
* Fork
* PointerTable

Complex schemas are constructed by composing simpler types together.

## Organization

The type system is organized into logical modules within `lib/types/`:

* `scalars.js`: Primitive and base types (e.g., `Uint`, `Enum`, `Tile`).
* `collections.js`: Container and structural types (e.g., `List`, `Struct`, `Bitmask`).
* `text.js`: String and text processing types (e.g., `TextStr`, `TextScript`).
* `pointers.js`: Reference and pointer types (e.g., `Pointer`, `Dereference`).
* `ops.js`: Logic and operational types (e.g., `Range`, `Fork`, `Custom`).
* `utils.js`: Core utilities and abstract base classes.

---

## Custom Types

Projects may define custom types.

Custom types are registered through the Project and become available during schema compilation.

The core engine does not distinguish between built-in and project-defined types.

---

## Design Principle

The type system prioritizes simplicity.

Every type exposes the same conceptual interface, even if some operations are trivial or delegated to child types.

This uniformity makes the system easier to understand, extend, and compose.

