# Codec Architecture & Ergonomics Migration

## 1. Motivation & Goals

The primary goal of this migration is to overhaul the Romance codec definition system, shifting from an ES class-based inheritance model (`class Foo extends CodecNode`) to an ergonomic, decoupled factory and descriptor pattern (`CodecKit`). 

Key objectives and architectural drivers include:
*   **Developer Experience (DevEx) & Boilerplate Reduction:** Eliminate the ceremony of class definitions, `constructor` boilerplate, and manual `satisfiesRomance` assertions.
*   **Automatic Type Safety & Inference:** Enable deep, automatic type propagation of `<Data>` and `<Formatted>` generics through nested codec schemas without requiring verbose manual generic annotations on every constructor.
*   **Architectural Resilience & Compilation Speed:** Address circular dependency issues during TypeScript compilation by isolating codec registries through TypeScript module augmentation rather than central monolithic imports.
*   **Separation of Concerns:** Clearly decouple static initialization and dependency resolution (Factory/Descriptor phase) from high-frequency serialization/deserialization logic (Instance phase).

---

## 2. Core Mechanisms

### CodecKit & Registry Scoping (`CodecKit`)
The `CodecKit` class replaces the earlier `CodecContext` concept. It acts as a namespacing container and helper utility for defining codecs while scoping the compilation API (`CompileApi<Config['registry']>`).
*   **`CodecKit.simple()`**: Used for non-generic or standard codecs with fixed argument shapes. Automatically registers the codec and narrows the configuration context.
*   **`CodecKit.composite()`**: Used for generic codecs (e.g., `List`, `Struct`) where child codec nodes and type parameters must propagate.
*   **`CodecKit.from<{ ... }>()`**: Allows sub-registries or dependent codec kits to declare precise registry dependencies for nested compilation.
*   **`CodecKit.Complete`**: Pre-configured kit for the master registry.
*   **`.run()` Builder Pattern**: Allows binding dependent sub-registries and referencing `Kit.Api` in complex composite codecs:
    ```typescript
    const Script = CodecKit.from<{
      list: typeof List;
      fork: typeof Fork;
    }>().run(Kit => Kit.composite({
      alias: 'script',
      kind: 'array',
      rule: 'script',
      construct(args, api: typeof Kit.Api) {
        const $script = api.item('list', { ... });
        return passthrough($script);
      }
    }));
    ```

### Factory-Descriptor Decoupling
Codecs are no longer instantiated via `new Type()`. Instead, they are defined as descriptor objects containing:
1.  **Metadata**: `alias` and `kind` (`'number' | 'boolean' | 'string' | 'array' | 'object' | 'void' | 'unknown' | 'passthrough'`).
2.  **Validation & Normalization**: `isValidArgs` (type guard for input arguments) and `normalizeArgs` (shorthand-to-canonical normalization).
3.  **`construct(args, api)`**: A factory function that closes over dependencies and returns a stable `CodecInstance` object implementing:
    *   `decode(rom, api)`
    *   `encode(data, rom, api)`
    *   `format(data, api)`
    *   `parse(formatted, api)`

### Type Propagation via CodecRules
Rather than complex recursive class constructors, type propagation is driven by the `CodecRules` registry:
*   **`CodecRules`**: Maps rule keys (e.g., `'item'`, `'list'`) to tuple types `[Data, Formatted]`.
*   **`RuleTuple` & `CodecNode`**: `api.item()` inspects the codec and its arguments against `CodecRules` to automatically derive the correct `<Data>` and `<Formatted>` types for the resulting node.

### Master Codec Registry & Module Augmentation
To prevent circular compilation dependencies, and to enable custom codec authoring by users, codecs register themselves into the global TypeScript environment via module augmentation rather than importing all codec classes into a central registry file:
```typescript
declare module '../codec-registry.js' {
  interface MasterCodecRegistry {
    myCodec: typeof MyCodec;
  }
}
```

---

## 3. Rationale for Meaningful Changes

### 1. Shift from ES Classes to Factory Descriptors (`CodecKit`)
*   **Rationale:** ES classes mixed object-oriented boilerplate with execution logic. Classes required significantly more manual type annotations, and were semantically inappropriate for the Codec system overall. By shifting to pure descriptor objects and a single `construct()` factory function returning an execution instance, we separate metadata/validation from execution, reduce memory overhead, and simplify type inference.

### 2. Adoption of `CodecRules` over Manual Constructor Generics
*   **Rationale:** In the class-based system, complex generic codecs required verbose constructor signatures and manual type casting (`as unknown as CodecNode<...>` ). `CodecRules` externalizes type mapping into a declarative type lookup dictionary (`CodecRules`), allowing `api.item()` to automatically infer child-to-parent type propagation cleanly at compile time.

### 3. TypeScript Module Augmentation for Registries
*   **Rationale:** Centralized registry imports caused circular dependency cycles between codec definitions and codec implementations. Module augmentation (`declare module`) allows each codec module to contribute its type definition to `MasterCodecRegistry` independently, decoupling compilation units.

---

## 4. Coding Conventions & Best Practices

### Closure Variable Prefixing (`$`)
Within `construct()` functions, using the `$` prefix for variables holding closed-over state from the factory scope can enhance readability:
```typescript
construct({ item, length }: ListArgs, api) {
  const $item = api.item('uint', { size: length });
  return {
    decode: (rom) => $item.decode(rom),
    // ...
  };
}
```
*   **Rationale:** Signals member-level or closure-scoped dependencies vs. local function processing variables.

### Utility Helpers (`utils.ts`)
Common helpers such as `passthrough`, `isUint`, `isObj`, `isStr`, and `hasOnlyOne` should be utilized across codec definitions to ensure consistent runtime validation and argument handling.
