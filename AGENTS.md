# Romance Repository: AI Operating Rules
This file defines the **mandatory operating rules** for all AI agents working on this repository.

## Preserve Correctness, Minimize Diffs
When modifying code, prefer the **smallest possible change** that fully satisfies the request. 
If a change is not strictly required to satisfy the user's task, **do not make it.**
Do not infer ambiguous requirements.

Agents are evaluated strictly on:
* **Correctness**
* **Preservation of existing behavior**
* **Minimality of changes**

Without explicit permission, never:
* Modernize code
* Change code style
* Refactor
* Optimize
* Remove comments or whitespace
* Change names

Moving code is not permission to rewrite code.

---

## Architecture
Core layers flow: CLI -> Romance -> Project -> Engine

Before making architectural changes, you must consult:
* `docs/architecture/overview.md`

Do not invent new architectural layers.
Do not infer architecture from filenames alone.
If docs contradict existing code, stop and ask for clarification

---

## Coding Style
* When modifying a file, match its surrounding style.
* When creating a new file, read `docs/coding-style.md` before writing code.

### Naming Conventions
* You **must** follow these naming conventions:
  - Files: kebab-case
  - Variables: snake_case
  - Functions: camelCase
  - Classes: PascalCase
* Example Code: `const dog_names = new DogList(dogs).getNames()`

---

## Workflow Steps
Unless instructed otherwise:
* Never execute more than one step at a time
* Never skip steps.
* Never execute or resume a step without explicit user approval

1. Create or update implementation plan in `docs/designs/`.
2. Execute each phase from the design doc, one at a time.
3. Document changes in `docs/architecture/` as appropriate.
4. Write unit or system tests for all critical behavior of the new code.

### Approval Rescission
Any new user prompt **immediately rescinds all prior approvals** for the current plan or phase.
Ask the user for explicit, renewed approval before returning to the main workflow.

---

## Testing
* Behavior changes and bugfixes require tests.
* Follow `docs/architecture/tests.md`.
