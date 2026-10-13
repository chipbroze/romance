# Design Proposal: Valibot Integration for Type Argument Validation

## Problem
Currently, type argument validation (`isValidArgs()`) across the type system is implemented using manual type checking and conditional error throwing (e.g. checking `typeof`, `Number.isInteger`, `Rom.isValidSize`, custom range checks, etc.). This leads to repetitive boilerplate code across multiple codec types (`Uint`, `Fixed`, `Enum`, etc.) and inconsistent error handling.

## Proposed Solution
Leverage [Valibot](https://valibot.dev/) (already installed as a dependency) directly.

Validation will follow a strict two-phase pattern within `isValidArgs(args)`:
1. **Phase 1 (Valibot Shape Validation):** Define general shapes/schemas of arguments using Valibot and assert them using `v.assert(Schema, args)` to validate shape and narrow TypeScript types in place without object allocation or copying.
2. **Phase 2 (Procedural Business Logic):** Perform any additional custom validation and business rules manually afterwards in procedural code, throwing standard `Error`s.

### Guidelines

**Approved Toolkit**
v.assert(Schema, target): Primary validation gateway. Throws immediately on structural failure.
v.object(...): Blueprint for standard records. (Preserves extra keys when used with v.assert).
v.array(...): Array type assertion.
v.instance(Class): Built-in instanceof check. Automatically uses Class.name in error messages.
v.picklist([...]): Asserts input is one of a fixed list of literal values.
v.union([...]): Supports multi-type structural shapes.
v.string()
v.number()
v.boolean()
v.function()
v.any(): Acceptable when any value is allowed, or when phase 2 custom validation will handle it.

**Avoid**
v.pipe(), v.check(), v.custom(): Do not embed custom assertions or procedural validation inside schemas. Keep all domain logic in Phase 2.
v.parse() / v.safeParse(): These allocate new objects and strip unmapped fields. Use v.assert() to validate original references in-place.
v.looseObject() / v.strictObject(): Redundant when using v.assert(). Standard v.object() naturally preserves unmapped properties without cloning.
v.transform() / Mutations: Codec validation must remain pure and read-only.

### Example Pattern (`ForkCodec`)
```ts
import * as v from 'valibot';

const fork_schema = v.object({
  control: v.instance(TypeNode),
  options: v.array(
    v.object({
      item: v.instance(TypeNode),
      name: v.string(),
      match: v.array(v.any()),
    })
  ),
});

class ForkCodec {
  isValidArgs(args: Dict): args is ForkArgs {
    // Phase 1: Validates shape and narrows TypeScript types in place 
    // without object allocation or copying. Throws if invalid.
    v.assert(fork_schema, args);

    // Phase 2: Clean procedural business logic working directly on `args`
    const control_kind = args.control.kind;

    if (!['number', 'boolean', 'string'].includes(control_kind)) {
      throw new Error(`Expected fork control to return type: number, boolean, or string. Found ${control_kind}`);
    }
    
    // etc...

    return true;
  }
}
```

## Phased Implementation Proposal

### Phase 1: Scalar Types Migration
- Refactor `src/lib/types/scalars.ts` (`Uint`, `Fixed`, `Enum`, etc.) to use Valibot schemas and `v.assert()` without helpers or `v.custom()`/`v.check()`/`v.pipe()`.
- Verify all existing tests pass.

### Phase 2: Remaining Types Migration
- Refactor collection types, text types, pointers, and ops types to use Valibot shape schemas and `v.assert()` followed by manual Phase 2 checks.
- If significant code is duplicated across multiple types files, extract into the `src/lib/types/utils.ts` file.

### Phase 3: Verification & Documentation
- Run full test suite (`npm test`).
- Update architecture documentation in `docs/architecture/type-system.md` if necessary.
