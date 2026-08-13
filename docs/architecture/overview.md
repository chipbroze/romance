# Romance Architecture Overview

## Overview

Romance is a bidirectional binary serialization framework designed for ROM hacking and other binary data transformation workflows.

The project allows binary data to be decoded into a structured representation, edited in a human-readable form, and re-encoded back into its original binary form.

The primary design goal is symmetry:

```text
ROM -> Decode -> Internal Data -> Encode -> ROM
```

and

```text
Internal Data -> Format -> Editable Data -> Parse -> Internal Data
```

A valid schema should support lossless round-trip conversion in both directions.

---

## Long-Term Vision

Romance is intended to support multiple interfaces over the same schema system.

Today, Romance supports:

* Command-line import and dump workflows
* Programmatic library usage

Future versions are expected to support:

* Browser-based editors generated directly from schema definitions
* Rich type-specific form rendering
* Interactive validation and editing tools

The same schema graph should be usable across all interfaces.

---

## Architectural Layers

```text
CLI
 │
 ▼
Romance
 │
 ▼
Project
 │
 ▼
Engine
 │
 ▼
Type Graph
```

Each layer has a distinct responsibility.

---

## CLI

The CLI provides command-line access to Romance.

Examples:

```text
romance dump
romance import
```

Responsibilities:

* argument parsing
* help generation
* command validation
* translating CLI input into Romance API calls

The CLI does not contain schema logic, binary decoding logic, or serialization logic.

---

## Romance

`Romance` is the primary public API.

Both the CLI and library consumers interact with the system through Romance.

Responsibilities:

* loading manifests
* loading projects
* ROM I/O helpers
* workspace I/O helpers
* orchestration of import and dump operations
* exposing future frontend compilation workflows

Examples:

```js
const romance = await Romance.fromManifestPath('manifest.yaml');

const workspace = await romance.dump(...);

const rom = await romance.import(...);
```

Romance coordinates operations but does not perform schema traversal directly.

---

## Project

A Project represents a configured repository of resources.

A Project owns:

* schemas
* custom types
* hooks
* profiles

Projects are responsible for constructing engines configured for a particular profile.

A Project defines what resources exist.

An Engine defines how those resources execute.

---

## Engine

The Engine performs execution.

Responsibilities:

* schema graph compilation
* decode traversal
* encode traversal
* parse traversal
* format traversal
* hook execution

An Engine represents a fully configured execution environment for a specific profile.

Today, schema compilation occurs inside the Engine.

*Note: The core engine is currently undergoing a TypeScript migration to improve type safety and maintainability, though the architectural principles remain consistent.*

In the future, compilation may move into the Project layer so compiled schema graphs can be reused across multiple engine instances.

---

## Type Graph

The type graph is the executable representation of a schema.

Schemas are authored declaratively and compiled into a graph of type instances.

The graph is traversed by the Engine during:

* decode
* encode
* parse
* format

Types are the fundamental building blocks of the system.

Examples include:

* UInt
* List
* Struct
* Fork
* PointerTable
* Tile
* project-defined custom types

All types support four primary operations:

* decode()
* encode()
* parse()
* format()

These operations form two independent serialization pipelines:

```text
ROM <-> Internal Data
```

and

```text
Editable Data <-> Internal Data
```

---

## Data Flow

### Dump

```text
ROM
 │
 ▼
Decode
 │
 ▼
Internal Data
 │
 ▼
Hooks
 │
 ▼
Format
 │
 ▼
Workspace
```

### Import

```text
Workspace
 │
 ▼
Parse
 │
 ▼
Internal Data
 │
 ▼
Hooks
 │
 ▼
Encode
 │
 ▼
ROM
```

---

## Validation

Romance supports optional round-trip validation.

Dump validation:

```text
Decode
 ↓
Encode
 ↓
Decode
```

Import validation:

```text
Parse
 ↓
Format
 ↓
Parse
```

The resulting structures must be equivalent.

Validation is primarily intended as a correctness and debugging tool and may significantly increase runtime cost.

---

## Design Principles

### Bidirectional by Default

Every transformation should support both reading and writing.

### Declarative Schemas

Schemas describe structure rather than execution.

### Extensibility

Projects may define custom types and hooks without modifying the framework.

### Separation of Concerns

CLI, orchestration, project configuration, and execution are distinct layers.

### Interface Independence

The same schema definitions should support command-line tools, programmatic APIs, and future frontend applications.

---

## Related Documents

* type-system.md
* schema-system.md
* frontend.md

