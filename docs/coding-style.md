# Romance Coding Style Guide

## Purpose

This document defines the coding conventions used throughout
the Romance project.

The goal is consistency, readability, and maintainability.
New code should feel like a natural extension of the existing codebase.

When multiple implementations are technically correct, prefer the
implementation that best matches the conventions described here.

---

# Core Principles

## Prefer Readability

Code is read more often than it is written.

Favor:

* explicit data flow
* descriptive names
* readable formatting
* obvious interfaces

over minimizing line count.

**Prefer:**

```js
return {
  profile,
  rom,
  workspace,
  flags
};
```

**over:**

```js
return { profile, rom, workspace, flags };
```

even when both fit comfortably within the line length limit.

---

## Prefer Self-Documenting Code

Code should be understandable without requiring comments.

Favor:

* descriptive names
* small focused functions
* explicit data flow
* well-defined interfaces

Comments should be used when intent cannot be expressed clearly
through code alone.

---

# Formatting

## Indentation

Use two spaces.

```js
if (condition) {
  doSomething();
}
```

---

## Braces

Opening braces remain on the same line.

```js
function parseFile () {
  ...
}
```

---

## Spacing Before Parentheses

Insert a space before parentheses in:

* function declarations
* method declarations
* class methods
* control statements

**Examples:**

```js
function parseFile () {}

class Project {
  compile () {}
}

if (value) {}
while (value) {}
for (;;) {}
```

Function invocation does **not** use a space:

```js
parseFile();
formatter.parse();
```

This visual distinction is intentional.

---

## Semicolons

Always use semicolons.

---

## Quotes

Prefer single quotes for strings.

```js
const name = 'Terra';
```

Use backticks when:

* string interpolation is required
* the string contains single quotes and readability would benefit

```js
const message = `Failed to load ${rom_path}`;
const text = `It's dangerous to go alone`;
```

Avoid double quotes unless required by external constraints.

---

## Line Length

Prefer approximately 80 columns.

Occasional exceptions are acceptable when breaking the line
would significantly reduce readability.

Readability takes precedence over strict enforcement.

---

## Vertical Collection Formatting

Collections containing several entries should generally be
written vertically, even when they fit within the line length limit.

This applies to:

* object literals
* destructuring assignments
* named imports
* named exports
* long parameter lists
* arrays

**Prefer:**

```js
const {
  profile,
  rom,
  workspace,
  flags = {}
} = input;

const config = {
  profile,
  rom,
  workspace
};

import {
  safeImport,
  safeRead,
  writeDir
} from './lib/fs.js';
```

over:

```js
const config = { profile, rom, workspace };
```

Readability takes precedence over compactness.

Small collections may remain inline when readability is not reduced.

---

## Switch Statements

Indent cases relative to the `switch`.

Every case block, including `default`, should be wrapped in braces.

```js
switch (type) {
  case 'byte': {
    this.index += 1;
    return this.view.getUint8(i);
  }

  case 'word': {
    this.index += 2;
    return this.view.getUint16(i, true);
  }

  default: {
    throw new Error(`Read type ${type} not supported`);
  }
}
```

Braces make case scoping explicit and allow `const` and `let` declarations without leaking across cases.

---

# Modules & Structure

## Concentrated Exports

To ensure the module's entire public API can be understood from a single
location, prefer a single export block at the beginning or end of the file.

Avoid scattered inline exports.

**Prefer:**

```js
class Romance {}
class Engine {}

export {
  Romance,
  Engine
};
```

---

## Import Ordering

Group imports in the following order:

1. Node built-ins
2. Third-party modules
3. Local project modules

```js
import { promises as fs } from 'node:fs';
import path from 'node:path';

import yaml from 'yaml';

import { Project } from './lib/project.js';
```

Ordering matters.

---

## File Naming

Prefer kebab-case for filenames.

Examples:

```text
schema-loader.js
romance-engine.js
project-registry.js
```

---

# Naming

## Classes

Use PascalCase.

```js
class Romance {}
class Project {}
class Engine {}
```

---

## Functions and Methods

Use camelCase.

```js
parseFile();
loadWorkspace();
importSchemas();
```

---

## Variables

Use snake_case.

This applies to:

* local variables
* parameters
* private data fields

```js
const rom_path = ...;
const schema_registry = ...;
const workspace_dir = ...;
```

---

## Constants

Use SCREAMING_SNAKE_CASE.

```js
const CLI_NAME = 'romance';
```

---

# Functions & Classes

## Function Parameters

Prefer 0–2 positional parameters.

Three parameters are occasionally acceptable when the relationship
is conventional.

Four or more parameters generally indicate the need for an options object.

**Prefer:**

```js
dump({
  profile,
  rom,
  flags
});
```

over:

```js
dump(profile, rom, validate, overwrite, hooks);
```

Explicit interfaces are preferred over remembering parameter order.

---

## Destructuring Placement

Prefer destructuring inside the function body rather than in the
function signature, unless extracting only one or two fields.

**Prefer:**

```js
function processInput (input) {
  const {
    profile,
    rom,
    workspace,
    flags
  } = input;
}
```

---

## Return Statements

Prefer a single return statement at the end of a function.

Early returns near the beginning of a function are encouraged
for validation and guard clauses.

**Prefer:**

```js
if (!schema) {
  return null;
}

const result = compile(schema);

return result;
```

Avoid multiple return paths throughout the body when a single final
return improves readability.

---

## Prefer Immutable Instances

Class instances should generally become immutable after construction.

Mutable state should be explicit and intentional.

Instance properties should rarely be reassigned after initialization.

---

## Constructors

Direct construction is acceptable.

Static factory methods may be used when they improve validation,
readability, or support asynchronous initialization.

```js
new Project(...)

Project.from(...)
Project.fromManifest(...)
```

---

# Language Features

## Equality

Always use strict equality.

```js
if (status === 'active') {}
```

The only acceptable exception is checking for both `null` and `undefined`.

```js
if (value == null) {}
```

---

## Asynchronous Flow Control

Both `async/await` and `.then()` are acceptable.

Use whichever produces the clearest code.

General preference:

* `async/await` for control flow
* `.then()` for simple transformations

---

## Explicit Async Functions

Use `async` liberally for functions that return Promises.

This makes asynchronous behavior obvious at the call site.

**Prefer:**

```js
async function loadConfig () {
  return safeRead(path);
}
```

---

# Error Handling

## Throw Error Objects

Always throw `Error` instances.

Never throw strings.

---

## Preserve Context

When rethrowing, preserve the original error using `cause`.

```js
try {
  parseRomData();
} catch (error) {
  throw new Error(
    `Failed to initialize profile ${profile_name}`,
    { cause: error }
  );
}
```

---

## Validate Early

Validate inputs near system boundaries whenever practical.

---

# Comments

## Explain Why

Comments should explain reasoning, intent, or constraints.

Do not restate what the code already says.

**Good:**

```js
// Validation is expensive and intended for debugging only.
```

**Bad:**

```js
// Increment index by one.
index += 1;
```

---

## Use Comments Sparingly

Prefer extracting logic into well-named functions before adding
explanatory comments.

Comments are an escape hatch when self-documenting code is not feasible.

Comments may also be used to break up large logical sections of code.

---

## Standard Markers

Use:

* `TODO:`
* `NOTE:`
* `FIXME:`

for special comments.

---

# Performance-Sensitive Code

Style rules exist to improve readability and maintainability.

In performance-critical code paths, any style rule may be relaxed
when a measurable performance benefit exists.

Deviations should be:

* intentional
* documented
* supported by benchmarks or profiling data

For example:

```js
for (let i = 0; i < length; ++i) {
  ...
}
```

may be preferable to a more readable alternative when it exists within
a demonstrated hot path.

Correctness and readability remain preferred when performance
differences are insignificant.

