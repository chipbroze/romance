
import type {
  Dict
} from '../utils/types.js';

import type {
  CodecRegistry,
  CodecRules,

  RomanceCodec,
  CodecInstance,
  CodecConfig,
  DefaultConfig,
  CompileApi,
  RuntimeApi,
  SimpleCodec,
  CompositeCodec,
  ConstructConstraint
} from './codec-types.js';


// #########################################################################
// Helper Types
// #########################################################################

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySimpleCodec = SimpleCodec<any, any, any, any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCompositeCodec = CompositeCodec<any, any, any, any, any>;
type AnyRomanceCodec = AnySimpleCodec | AnyCompositeCodec;

// #########################################################################
// Codec Configurations
// Configurations wrap sub-registries to break circular evaluations
// #########################################################################

// Helper to strip out SubRegistry workaround
type RuntimeConfig <C extends CodecConfig> = (
  Omit<C, 'registry'> & { registry: CodecRegistry }
);

// #########################################################################
// Codec Registration
// #########################################################################

const registered_codecs = new Map<string, RomanceCodec>();

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
  register (...codecs: AnyRomanceCodec[]) {
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
    // Ensure full CodecRegistry is used for all codecs
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
    instance: CodecInstance<Data, Formatted, Config['registry']>
  ): CodecInstance<Data, Formatted, Config['registry']> {
    return instance;
  }
};


type CodecAlias = keyof CodecRegistry;

class Codex {
  #codecs: Map<string, RomanceCodec> = new Map();

  constructor (extra_codecs: unknown[] = []) {
    const all_codecs = [
      ...registered_codecs.values(),
      ...extra_codecs
    ];
    for (const romance_codec of all_codecs) {
      assertRomanceCodec(romance_codec);
      this.#codecs.set(romance_codec.alias, romance_codec);
    }
  }

  has (alias: unknown): alias is CodecAlias {
    return typeof alias === 'string' && this.#codecs.has(alias);
  }

  get <T extends CodecAlias> (alias: T): CodecRegistry[T] {
    return this.#codecs.get(alias) as CodecRegistry[T];
  }
}

function assertRomanceCodec (
  unknown: unknown
): asserts unknown is RomanceCodec {
  if (!unknown || typeof unknown !== 'object') {
    throw new Error('Invalid Codec: Expected object definition');
  }
  if (typeof (unknown as Dict).alias !== 'string') {
    throw new Error('Invalid Codec: Expected "alias" to be type: string');
  }
  if (typeof (unknown as Dict).construct !== 'function') {
    const alias = (unknown as Dict).alias;
    throw new Error(`Invalid Codec "${alias}": Missing "construct" function`);
  }
  // TODO: Validate decode/encode/format/parse methods
}

export {
  Codex,
  CodecKit
};

