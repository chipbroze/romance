# Frontend Vision

## Overview

A long-term goal of Romance is to support browser-based editing workflows.

The frontend should be generated directly from the same schema definitions used by the command-line tools.

The schema system remains the single source of truth.

---

## Guiding Principle

The frontend should not require duplicate definitions.

The same schema should support:

```text
ROM Editing
CLI Import/Export
Library Usage
Web UI Generation
```

without requiring separate metadata files.

---

## Editable Representations

Today, Romance primarily exposes editable data through:

* YAML
* JSON
* Plain text

These formats are intended for human editing and version control.

A future frontend may choose to render this data directly.

Examples:

* YAML text editor
* JSON text editor
* raw text editor

---

## Structured Editors

Some schemas may benefit from richer interfaces.

Examples:

* tables
* forms
* enum dropdowns
* reference selectors
* tile editors
* script editors

The frontend may eventually render type-specific controls instead of generic text editors.

---

## Relationship to Types

Types already define how data is interpreted.

Future frontend rendering will likely build on this existing structure.

Possible future additions include:

```js
render()
derender()
```

or similar concepts.

No frontend-specific API has been finalized.

---

## Compilation

A future version of Romance may expose:

```js
romance.compile(...)
```

to generate a standalone frontend application from a project definition.

This functionality does not currently exist.

The exact implementation remains intentionally unspecified.

---

## Design Principle

Frontend functionality should emerge from existing schema definitions rather than introducing a parallel UI description language.

Schemas remain the source of truth.

