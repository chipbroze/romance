import * as base_types from './types.js';
import { EvilMap } from './map-utils.js';
import { Rom } from './rom.js';
import type { datasize } from './rom.js';
import type { UserOverrides } from './overrides.js';

interface SessionApi {
  getLib?: undefined | ((key: string) => unknown);
  setLib?: undefined | ((key: string, value: unknown) => void);
  fetch (ref: string): unknown;
  transform <T> (ref: string, fn: (data: unknown) => T): T;
}

interface CompileApi {
  item: <Alias extends TypeAlias> (
    type: Alias | { type: Alias, name: string },
    args: InputObjOf<MasterRegistry[Alias]>
  ) => Item<Alias>
}

interface RuntimeApi {
  item: CompileApi['item'];
  trace: (key: string, value: unknown) => void;
  scratch: <T> (create: () => T) => T;
  getLib: SessionApi['getLib'];
  setLib: SessionApi['setLib'];
  fetch: SessionApi['fetch'];
  transform: SessionApi['transform'];
}

type InstanceOf <T extends RomanceType> = InstanceType<T>;
type DataTypeOf <T extends RomanceType> = ReturnType<InstanceOf<T>['decode']>;
type ReadableOf <T extends RomanceType> = ReturnType<InstanceOf<T>['format']>;
type InputObjOf <T extends RomanceType> = ConstructorParameters<T>[0];

type BaseTypes = typeof base_types;

type TypeByAlias <Types> = {
  [k in keyof Types as Types[k] extends { alias: infer A extends string }
    ? A
    : never
  ]: Types[k];
};

type ValidOverrides = TypeByAlias<UserOverrides>;
type ExtendedRegistry = (
  Omit<TypeByAlias<BaseTypes>, keyof ValidOverrides> & ValidOverrides
);

type MasterRegistry = {
  [K in keyof ExtendedRegistry as ExtendedRegistry[K] extends (
    { alias: infer A extends string }
  ) ? A : never]: ExtendedRegistry[K];
};

type TypeAlias = keyof MasterRegistry;

/* ------------------------------------------------- */
/* eslint-disable @typescript-eslint/no-explicit-any */
// We don't require users to validate their function inputs

interface RomanceType <
  Alias extends string=string,
  Input extends Record<string, unknown>=any,
  Data=any,
  Readable=Data
> {
  readonly alias: Alias;
  readonly name: string;
  // We hardcode the datatype (kind) for runtime validation of child nodes
  readonly kind?: 'array' | 'number' | 'object' | 'string' | 'void' | 'unknown';
  // Runtime Normalization (Shorthand -> Canonical format)
  // Operates on loose dynamic input (schema specs / JSON)
  // Note that normalizations are expected to be safely idempotent
  normalizeArgs?: (args: Record<string, unknown>) => Record<string, unknown>;
  // Static / Direct Validation (Asserts canonical shape)
  isValidArgs?: (args: Record<string, unknown>) => args is Input;
  new (
    input: Input,
    api: CompileApi
  ): RomanceTypeInstance<Data, Readable>
}

/* eslint-enable @typescript-eslint/no-explicit-any */
/* ------------------------------------------------ */

interface RomanceTypeInstance <Data=unknown, Readable=Data> {
  decode: (rom: Rom, api: RuntimeApi) => Data;
  encode: (data: Data, rom: Rom, api: RuntimeApi) => void;
  format: (data: Data, api: RuntimeApi) => Readable;
  parse: (readable: Readable, api: RuntimeApi) => Data;
}

abstract class TypeNode <Data=unknown, Formatted=Data> {
  abstract get kind(): RomanceType['kind'];
  abstract decode (rom: Rom): Data;
  abstract encode (data: Data, rom: Rom): void;
  abstract format (data: Data): Formatted;
  abstract parse (readable: Formatted): Data;
}

type NodeData <I> =
  I extends TypeNode<infer D, unknown> ? D : never;

type NodeFormat <I> =
  I extends TypeNode<unknown, infer R> ? R : never;

type Item <Alias extends TypeAlias> = TypeNode<
  DataTypeOf<MasterRegistry[Alias]>,
  ReadableOf<MasterRegistry[Alias]>
>;

type ItemData <Alias extends TypeAlias> = NodeData<Item<Alias>>;
type ItemFormat <Alias extends TypeAlias> = NodeFormat<Item<Alias>>;

/**
 * Asserts that a class matches the RomanceType contract.
 */
function satisfiesRomance <
  Alias extends string,
  Input extends Record<string, unknown>, 
  Data, 
  Readable
> (
  _target: RomanceType<Alias, Input, Data, Readable>
): void {}

class TypeRegistry {
  #types: EvilMap<string, RomanceType> = new EvilMap();

  constructor (extra_types: unknown[] = []) {
    const all_types = [
      ...Object.values(base_types),
      ...extra_types
    ];

    for (const Type of all_types) {
      this.assertRomanceType(Type);
      this.#types.set(Type.alias, Type);
    }
  }

  has (type: unknown): type is TypeAlias {
    return typeof type === 'string' && this.#types.has(type);
  }

  get <T extends TypeAlias> (type: T): MasterRegistry[T] {
    return this.#types.get(type) as MasterRegistry[T];
  }

  assertRomanceType (
    unknown: unknown
  ): asserts unknown is RomanceType {
    const Type = unknown as Record<string, unknown>;
    const name = Type?.name || '' as string;
    const proto = Type?.prototype as Record<string, unknown>;
  
    const fail = (why: string) => {
      throw new Error(`Invalid Type: ${name} (${why})`);
    };
  
    if (typeof name !== 'string') {
      fail('expected "name" to be type: string');
    }
    if (typeof Type !== 'function') {
      fail('not a function');
    }
    if (typeof Type?.alias !== 'string') {
      fail('expected "alias" to be type: string');
    }
    if (!proto || typeof proto !== 'object') {
      fail('no prototype');
    }
    for (const method of ['encode', 'decode', 'format', 'parse']) {
      if (typeof proto[method] !== 'function') {
        fail(`no "${method}" method`);
      }
    }
  }
}

export {
  TypeRegistry,
  TypeNode,
  satisfiesRomance,
  Rom // TODO: Bundle all necessary types in one easy module
};
export type {
  TypeAlias,
  MasterRegistry,
  RomanceType,
  RomanceTypeInstance,
  SessionApi,
  CompileApi,
  RuntimeApi,
  Item,
  NodeData,
  NodeFormat,
  ItemData,
  ItemFormat,
  InputObjOf,
  DataTypeOf,
  ReadableOf,
  datasize
};
