import {
  Rom,
  type datasize
} from './rom.js';

// ###########################################################################
// Type Utilities
// ###########################################################################

type Dict = Record<string, unknown>;

// ###########################################################################
// Apis
// ###########################################################################

type SessionApi = {
  getLib?: undefined | ((key: string) => unknown);
  setLib?: undefined | ((key: string, value: unknown) => void);
  fetch (ref: string): unknown;
  transform <T> (ref: string, fn: (data: unknown) => T): T;
};

interface CompileApi <
  TypeRegistry extends object = object
> {
  item <
    Alias extends keyof TypeRegistry,
    Args extends InputOf<TypeRegistry[Alias]>
  > (
    type: Alias | { type: Alias, name: string },
    args: CodecConstraint<Alias, Args>
  // `extends infer Codec` forces TS to resolve lazy indexed types
  // immediately, avoiding `unknown` parameter inference in downstream codecs.
  ): (TypeRegistry[Alias] extends infer Codec
    ? CodecNode<Codec, Args>
    : never
  );
};

type RuntimeApi <
  TypeRegistry extends object = object
> = {
  item: CompileApi<TypeRegistry>['item'];
  trace: (key: string, value: unknown) => void;
  scratch: <T> (create: () => T) => T;
  getLib: SessionApi['getLib'];
  setLib: SessionApi['setLib'];
  fetch: SessionApi['fetch'];
  transform: SessionApi['transform'];
};

// ###########################################################################
// Romance Types
// ###########################################################################

interface CodecConstraints <Args=Dict> {
  never: Args extends never ? Args : never;
};

type CodecConstraint <Alias, Args> = (
  Alias extends keyof CodecConstraints
  ? CodecConstraints<Args>[Alias]
  : Args
);

// TODO: Can Construct be de-generic-ified now?
interface CodecRules <Args=Dict> {
  list: (Args extends { item: infer I extends TypeNode }
    ? [I['<Data>'][], I['<Formatted>'][]]
    : never
  );
  item: (Args extends { item: infer I extends TypeNode }
    ? [I['<Data>'], I['<Formatted>']]
    : never
  );
};

type RuleTuple <Codec, Args> = (
  Codec extends { rule: infer Rule extends keyof CodecRules }
  ? CodecRules<Args>[Rule]
  : Codec extends SimpleCodec<string, Dict, infer D, infer F>
  ? [D, F]
  : never
);
type TupleNode <T> = (
  T extends [infer D, infer F]
  ? TypeNode<D, F>
  : never
);
type CodecNode <Codec, Args> = (
  TupleNode<RuleTuple<Codec, Args>>
);
type AliasNode <Alias extends CodecAlias, Args> = (
  CodecNode<MasterRegistry[Alias], Args>
);

type RomanceTypeInstance <
  Data = unknown,
  Formatted = Data,
  TypeRegistry extends object = MasterRegistry
> = {
  decode: (rom: Rom, api: RuntimeApi<TypeRegistry>) => Data;
  encode: (data: Data, rom: Rom, api: RuntimeApi<TypeRegistry>) => void;
  format: (data: Data, api: RuntimeApi<TypeRegistry>) => Formatted;
  parse: (formatted: Formatted, api: RuntimeApi<TypeRegistry>) => Data;
};

type SimpleCodec <
  Alias extends string = string,
  Args extends Dict = Dict,
  Data = unknown,
  Formatted = Data,
  Config extends CodecConfig = DefaultConfig
> = {
  // Used for lookup of types for schema creation
  readonly alias: Alias;
  // Used by parent nodes to validate child nodes
  readonly kind: (
    | 'number' | 'boolean' | 'string'
    | 'array' | 'object'
    | 'void' | 'unknown' | 'passthrough'
  );
  // Idempotent transformation from shorthand -> canonical args
  normalizeArgs?: (args: Dict) => Dict;
  // Asserts canonical args shape
  isValidArgs?: (args: Dict) => args is Args;
  // Create type instances
  construct (
    args: Args,
    api: CompileApi<Config['registry']>
  ): RomanceTypeInstance<Data, Formatted, Config['registry']>;
};

type ConstructConstraint <
  ArgsShape extends Dict,
  Config extends CodecConfig = CodecConfig
> = (
  args: ArgsShape,
  api: CompileApi<Config['registry']>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => RomanceTypeInstance<any, any, Config['registry']>;

type CompositeCodec <
  Alias extends string = string,
  ArgsShape extends Dict = Dict,
  Config extends CodecConfig = DefaultConfig,
  Construct extends ConstructConstraint<ArgsShape, Config> =
    ConstructConstraint<ArgsShape, Config>,
  Rule extends keyof CodecRules = keyof CodecRules
> = {
  readonly alias: Alias;
  readonly kind: SimpleCodec['kind'];
  readonly rule: Rule;
  normalizeArgs?: (args: Dict) => Dict;
  isValidArgs?: (args: Dict) => args is ArgsShape;
  construct: Construct
};

type CodecConfig = {
  registry: object
};
type DefaultConfig = {
  registry: MasterRegistry
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySimpleCodec = SimpleCodec<any, any, any, any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCompositeCodec = CompositeCodec<any, any, any, any, any>;


// Helper to strip out SubRegistry workaround
type RuntimeConfig <C extends CodecConfig> = (
  Omit<C, 'registry'> & { registry: MasterRegistry }
);

const registered_codecs = new Map<string, RomanceType>();

class CodecKit <
  Config extends CodecConfig = CodecConfig
> {
  // Namespacing for annotating `api` arg in generic construct()
  declare readonly Api: CompileApi<Config['registry']>;
  declare readonly RuntimeApi: RuntimeApi<Config['registry']>;

  // Convenience methods for default Config
  static simple = new CodecKit().simple;
  static composite = new CodecKit().composite;
  static register = new CodecKit().register;
  static instance = new CodecKit().instance;
  static Complete = new CodecKit<DefaultConfig>();

  // Alternate access for "new" construction
  static from <R extends object> () {
    return new CodecKit<{ registry: R }>();
  }

  // Runtime (JS) Codec Registration
  register (...codecs: AnyRomanceType[]) {
    for (const codec of codecs) {
      assertRomanceCodec(codec);
      if (!registered_codecs.has(codec.alias)) {
        registered_codecs.set(codec.alias, codec);
      }
    }
  }

  // Helper to provide Kit as callback arg
  run <T> (fn: (Kit: this) => T): T {
    return fn(this);
  }

  simple <
    Alias extends string,
    Args extends Dict,
    Data,
    Formatted
  > (
    codec: SimpleCodec<
      Alias,
      Args,
      Data,
      Formatted,
      Config
    >
  ) {
    // Ensure full MasterRegistry is used for all codecs
    this.register(codec);
    return codec as SimpleCodec<
      Alias,
      Args,
      Data,
      Formatted,
      RuntimeConfig<Config>
    >;
  }

  composite <
    Alias extends string,
    ArgsShape extends Dict,
    Construct extends ConstructConstraint<ArgsShape>,
    Rule extends keyof CodecRules
  > (
    codec: CompositeCodec<
      Alias,
      ArgsShape,
      Config,
      Construct,
      Rule
    >
  ) {
    this.register(codec);
    return codec as CompositeCodec<
      Alias,
      ArgsShape,
      RuntimeConfig<Config>,
      Construct,
      Rule
    >;
  }

  // Ergonomic typing helper for composite instance objects
  instance <Data, Formatted = Data> (
    instance: RomanceTypeInstance<Data, Formatted, Config['registry']>
  ): RomanceTypeInstance<Data, Formatted, Config['registry']> {
    return instance;
  }
};

// ###########################################################################
// Master Type Registry
// ###########################################################################

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface MasterTypeRegistry {}

type MasterRegistry = MasterTypeRegistry;
type CodecAlias = keyof MasterRegistry;

/* eslint-disable @typescript-eslint/no-explicit-any */
type InputOf <T> = (
  T extends SimpleCodec<any, infer Args, any, any, any>
  ? Args
  : T extends CompositeCodec<any, infer ArgsShape, any, any, any>
  ? ArgsShape
  : never
);
/* eslint-enable @typescript-eslint/no-explicit-any */

type DataOf <Codec, Args = InputOf<Codec>> = RuleTuple<Codec, Args>[0];
type FormattedOf <Codec, Args = InputOf<Codec>> = RuleTuple<Codec, Args>[1];
type InputByAlias <Alias extends CodecAlias> = InputOf<MasterRegistry[Alias]>;

abstract class TypeNode <Data = unknown, Formatted = Data> {
  declare readonly '<Data>': Data;
  declare readonly '<Formatted>': Formatted;

  abstract get kind (): SimpleCodec['kind'];
  abstract decode (rom: Rom): Data;
  abstract encode (data: Data, rom: Rom): void;
  abstract format (data: Data): Formatted;
  abstract parse (formatted: Formatted): Data;
}

class TypeRegistry {
  #types: Map<string, RomanceType> = new Map();

  constructor (extra_types: unknown[] = []) {
    const all_types = [
      ...registered_codecs.values(),
      ...extra_types
    ];
    for (const romance_type of all_types) {
      assertRomanceCodec(romance_type);
      this.#types.set(romance_type.alias, romance_type);
    }
  }

  has (type: unknown): type is CodecAlias {
    return typeof type === 'string' && this.#types.has(type);
  }

  get <T extends CodecAlias> (type: T): MasterRegistry[T] {
    return this.#types.get(type) as MasterRegistry[T];
  }
}

function assertRomanceCodec (
  unknown: unknown
): asserts unknown is RomanceType {
  if (!unknown || typeof unknown !== 'object') {
    throw new Error('Invalid Type: Expected object definition');
  }
  if (typeof (unknown as Dict).alias !== 'string') {
    throw new Error('Invalid Type: Expected "alias" to be type: string');
  }
  if (typeof (unknown as Dict).construct !== 'function') {
    const alias = (unknown as Dict).alias;
    throw new Error(`Invalid Type "${alias}": Missing "construct" function`);
  }
  // TODO: Validate decode/encode/format/parse methods
}

type RomanceType = SimpleCodec | CompositeCodec;
type AnyRomanceType = AnySimpleCodec | AnyCompositeCodec;

export {
  TypeRegistry,
  TypeNode,
  CodecKit,
  Rom // TODO: Bundle all necessary types in one easy module
};
export type {
  AliasNode,
  CodecAlias,
  MasterTypeRegistry,
  CodecRules,
  CodecConstraint,
  CodecConstraints,
  RomanceType,
  RomanceTypeInstance,
  SessionApi,
  CompileApi,
  RuntimeApi,
  InputOf,
  DataOf,
  FormattedOf,
  InputByAlias,
  datasize
};
