
import type {
  Dict
} from '../utils/types.js';

import type {
  CodecRegistry,
  CodecRules,
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

class CodecKit <
  Config extends CodecConfig = CodecConfig
> {
  // Namespacing for annotating `api` arg in generic construct()
  declare readonly Api: CompileApi<Config['registry']>;
  declare readonly RuntimeApi: RuntimeApi<Config['registry']>;

  // Convenience methods for default Config
  static simple = new CodecKit().simple;
  static composite = new CodecKit().composite;
  static instance = new CodecKit().instance;
  static Complete = new CodecKit<DefaultConfig>();

  // Alternate access for "new" construction
  static from <R extends object> () {
    return new CodecKit<{ registry: R }>();
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

export {
  CodecKit
};

