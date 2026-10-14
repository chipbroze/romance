# Codec System

## Overview

Codecs are the fundamental building blocks of Romance schemas.

A codec is responsible for translating between an external representation and an internal representation.

Codecs participate in two independent serialization pipelines:

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

Every codec defines an internal representation.

Examples:

| Codec   | Internal Representation |
| ------ | ----------------------- |
| UInt   | number                  |
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

A valid codec should support lossless decode/encode round-trips.

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

A valid codec should support lossless format/parse round-trips.

---

## Composition

Codecs may contain other codecs.

Examples:

* Struct
* List
* Fork
* PointerTable

Complex schemas are constructed by composing simpler codecs together.

## Organization

Native codecs are organized into logical modules within `codecs/`:

* `scalars.js`: Primitive and base codecs (e.g., `Uint`, `Enum`, `Tile`).
* `collections.js`: Container and structural codecs (e.g., `List`, `Struct`, `Bitmask`).
* `text.js`: String and text processing codecs (e.g., `TextStr`, `TextScript`).
* `pointers.js`: Reference and pointer codecs (e.g., `Pointer`, `Dereference`).
* `ops.js`: Logic and operational codecs (e.g., `Range`, `Fork`, `Custom`).
* `utils.js`: Core utilities and abstract base classes.

---

## Custom Codecs

Projects may define custom codecs.

Custom codecs are registered through the Project and become available during schema compilation.

The core engine does not distinguish between built-in and project-defined codecs.

---

## Design Principle

The codec system prioritizes simplicity.

Every codec exposes the same conceptual interface, even if some operations are trivial or delegated to child codecs.

This uniformity makes the system easier to understand, extend, and compose.

