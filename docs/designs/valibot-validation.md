# Design Proposal: Valibot Integration for Type Argument Validation

## Problem
Currently, type argument validation (`isValidArgs()`) across the type system is implemented using manual type checking and conditional error throwing (e.g. checking `typeof`, `Number.isInteger`, `Rom.isValidSize`, custom range checks, etc.). This leads to repetitive boilerplate code across multiple codec types (`Uint`, `Fixed`, `Enum`, etc.) and inconsistent error handling.

## Proposed Solution
Leverage [Valibot](https://valibot.dev/) (already installed as a dependency) to declare and validate type arguments concisely and robustly. 

We will introduce validation helper utilities in `src/lib/types/utils.ts` that wrap Valibot schemas and provide:
1. Standardized error messages matching existing behavior.
2. TypeScript type guards (`args is T`).
3. Clean, declarative validation schemas for common argument patterns (e.g., `datasize`, `uint`, optional booleans, enum values arrays/records).

### Helper Design (`src/lib/types/utils.ts`)
```ts
import * as v from 'valibot';

export function createArgsValidator <TSchema extends v.GenericSchema<unknown, any>>(
  schema: TSchema,
  customErrorMsg?: (issue: v.IssueMessage<TSchema>) => string
) {
  return function isValidArgs (args: unknown): args is v.InferOutput<TSchema> {
    const result = v.safeParse(schema, args);
    if (!result.success) {
      // Format error message matching existing conventions
      const message = result.issues[0]?.message ?? 'Invalid arguments';
      throw new Error(message);
    }
    return true;
  };
}
```
Alternatively, specific helper builders for common patterns (like `uint`, `datasize`, `fixed` args) can be provided.

## Phased Implementation Proposal

### Phase 1: Utilities & Helpers
- Implement Valibot-based validation helper functions in `src/lib/types/utils.ts`.
- Add unit tests for the validation helpers ensuring correct error throwing and type guards.

### Phase 2: Scalar Types Migration
- Refactor `src/lib/types/scalars.ts` (`Uint`, `Fixed`, `Enum`, etc.) to use Valibot schemas and the new helper function.
- Verify all existing tests pass.

### Phase 3: Remaining Types Migration
- Refactor collection types, text types, pointers, and ops types to use Valibot for argument validation where appropriate.

### Phase 4: Verification & Documentation
- Run full test suite (`npm test`).
- Update architecture documentation in `docs/architecture/type-system.md` if necessary.
