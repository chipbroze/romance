
import type { Rom } from './rom.js';
import type { Dict } from '../utils/types.js';

// #########################################################################
// Codec Node & Codec Instance
// 
// Fundamental contracts for Codec instances and their Node wrappers
// Phantom <Data> and <Formatted> props for easy access to generics
// #########################################################################

abstract class CodecNode <Data = unknown, Formatted = Data> {
  declare readonly '<Data>': Data;
  declare readonly '<Formatted>': Formatted;

  abstract get kind (): SimpleCodec['kind'];
  abstract decode (rom: Rom): Data;
  abstract encode (data: Data, rom: Rom): void;
  abstract format (data: Data): Formatted;
  abstract parse (formatted: Formatted): Data;
}

type CodecInstance <
  Data = unknown,
  Formatted = Data,
  Registry extends object = CodecRegistry
> = {
  decode: (rom: Rom, api: RuntimeApi<Registry>) => Data;
  encode: (data: Data, rom: Rom, api: RuntimeApi<Registry>) => void;
  format: (data: Data, api: RuntimeApi<Registry>) => Formatted;
  parse: (formatted: Formatted, api: RuntimeApi<Registry>) => Data;
};

// #########################################################################
// Codec Registries
//
// CodecRegistry is used by `api.item()` method to lookup codecs by alias
// CodecConstraints are used to enforce argument object sibling relations
// CodecRules are for extracting CodecNode outputs for composite codecs
// #########################################################################

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface CodecRegistry {}

interface CodecConstraints <Args=Dict> {
  never: Args extends never ? Args : never;
};

interface CodecRules <Args=Dict> {
  list: (Args extends { item: infer I extends CodecNode }
    ? [I['<Data>'][], I['<Formatted>'][]]
    : never
  );
  item: (Args extends { item: infer I extends CodecNode }
    ? [I['<Data>'], I['<Formatted>']]
    : never
  );
};

// ###########################################################################
// Romance Codecs
// ###########################################################################

type CodecConfig = {
  registry: object
};

type DefaultConfig = {
  registry: CodecRegistry
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
  ): CodecInstance<Data, Formatted, Config['registry']>;
};

type ConstructConstraint <
  ArgsShape extends Dict,
  Config extends CodecConfig = CodecConfig
> = (
  args: ArgsShape,
  api: CompileApi<Config['registry']>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => CodecInstance<any, any, Config['registry']>;

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

type RomanceCodec = SimpleCodec | CompositeCodec;

// ###########################################################################
// Codec Helpers
// ###########################################################################

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

type CodecConstraint <Alias, Args> = (
  Alias extends keyof CodecConstraints
  ? CodecConstraints<Args>[Alias]
  : Args
);

type RuleTuple <Codec, Args> = (
  Codec extends { rule: infer Rule extends keyof CodecRules }
  ? CodecRules<Args>[Rule]
  : Codec extends SimpleCodec<string, Dict, infer D, infer F>
  ? [D, F]
  : never
);
type TupleNode <T> = (
  T extends [infer D, infer F]
  ? CodecNode<D, F>
  : never
);
type CodecNodeFor <Codec, Args> = (
  TupleNode<RuleTuple<Codec, Args>>
);

// #########################################################################
// Api Contracts
// #########################################################################

type SessionApi = {
  getLib?: undefined | ((key: string) => unknown);
  setLib?: undefined | ((key: string, value: unknown) => void);
  fetch (ref: string): unknown;
  transform <T> (ref: string, fn: (data: unknown) => T): T;
};

type CompileApi <
  Registry extends object = object
> = {
  item <
    Alias extends keyof Registry,
    Args extends InputOf<Registry[Alias]>
  > (
    type: Alias | { type: Alias, name: string },
    args: CodecConstraint<Alias, Args>
  // `extends infer Codec` forces TS to resolve lazy indexed types
  // immediately, avoiding `unknown` parameter inference in downstream codecs.
  ): (Registry[Alias] extends infer Codec
    ? CodecNodeFor<Codec, Args>
    : never
  );
};

type RuntimeApi <
  Registry extends object = object
> = {
  item: CompileApi<Registry>['item'];
  trace: (key: string, value: unknown) => void;
  scratch: <T> (create: () => T) => T;
  getLib: SessionApi['getLib'];
  setLib: SessionApi['setLib'];
  fetch: SessionApi['fetch'];
  transform: SessionApi['transform'];
};

export {
  CodecNode
}
export type {
  CodecRegistry,
  CodecRules,
  CodecConstraints,

  SimpleCodec,
  CompositeCodec,
  RomanceCodec,
  CodecInstance,
  ConstructConstraint,
  InputOf,
  DataOf,
  FormattedOf,
  SessionApi,
  CompileApi,
  RuntimeApi,

  CodecConfig,
  DefaultConfig
}
