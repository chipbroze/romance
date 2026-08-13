# Schema System

## Overview

Schemas describe how data is structured.

A schema is a declarative description of a binary format and its editable representation.

Schemas do not perform work themselves.

Instead, schemas are compiled into executable type graphs by the Engine.

---

## Schema Definitions

Schemas are authored as JavaScript modules.

A schema typically exports a root type definition.

Example:

```js
export const commands = $type('range', {
  org: 0xC2278A,
  item: $type('list', {
    length: 32,
    item: command
  })
});
```

The exported object is a schema abstract syntax tree (AST).

---

## Compilation

The Engine compiles schema ASTs into executable type graphs.

Compilation resolves:

* built-in types
* custom types
* references
* hooks
* profiles

The resulting graph is used for runtime execution.

---

## Cross-Schema References

Schemas may reference data defined by other schemas.

Examples include:

* RefPath
* Transformer

These references are resolved through the Engine and Project.

This allows schemas to remain modular while still participating in larger data models.

---

## Profiles

Profiles define subsets of schemas and behavior.

Examples:

```yaml
profiles:
  basic:
    schemas:
      - commands
      - spells
```

Profiles allow different engine configurations to be constructed from the same project.

---

## Design Principle

Schemas describe structure rather than execution.

Execution logic belongs in the Engine.

Schemas should remain declarative whenever possible.

