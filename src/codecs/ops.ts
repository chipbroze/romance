import {
  isObj,
  isStr,
  Lookup,
  hex,
  getAtPath,
  asNode,
  passthrough,
  type Dict,
  type NumDict
} from './utils.js';

import * as v from './valibot.js';
import { type Rom } from '../core/rom.js';

import {
  list_mode_schema,
  type List,
  type ListModeSpec
} from './collections.js';

import {
  CodecKit,
  type TypeNode,
} from '../core/type-registry.js';

import type {
  datasize
} from '../core/type-registry.js';

import type {
  Uint
} from './scalars.js';

declare module '../core/type-registry.js' {
  interface MasterTypeRegistry {
    range: typeof Range;
    modifier: typeof Modifier;
    view: typeof View;
    custom: typeof Custom;
    fork: typeof Fork;
    script: typeof Script;
    resolver: typeof Resolver;
  }

  interface CodecRules <Args=Dict> {
    view: (Args extends ViewArgs<infer Item, infer F>
      ? [Item['<Data>'], F]
      : never
    );
    custom: (Args extends CustomArgs<infer D, infer F>
      ? [D, F]
      : never
    );
    fork: (Args extends ForkArgs<infer ControlNode, infer Options> ? [
      ForkDataFor<ControlNode['<Data>'], Options>,
      ForkFormattedFor<ControlNode['<Data>'], Options>
    ] : never);
    script: (Args extends ScriptArgs<infer ControlNode, infer Options> ? [
      ForkDataFor<ControlNode['<Data>'], Options>[],
      ForkFormattedFor<ControlNode['<Data>'], Options>[]
    ] : never);
  }

  interface CodecConstraints <Args=Dict> {
    fork: Args extends ForkArgs<infer _C, infer _O> ? Args
      : 'ForkArgs: control and options data type mismatch';
    resolver: Args extends ResolverArgs<infer _D, infer _F, infer _I, infer _S> ? Args
      : 'ResolverArgs: ensure self object is typed to match toNode param';
  }

  // interface CompileApi <TypeRegistry extends object = object> {
  //   item <
  //     ControlNode extends TypeNode<ForkControl, unknown>,
  //     const Options extends ForkOptions<ControlNode['<Data>']>
  //   > (
  //     alias: 'fork',
  //     args: ForkArgs<ControlNode, Options>
  //   ): TypeNode<
  //     ForkDataFor<ControlNode['<Data>'], Options>,
  //     ForkFormattedFor<ControlNode['<Data>'], Options>
  //   >
  // }
}

type CompileApi = typeof CodecKit.Complete.Api;
type RuntimeApi = typeof CodecKit.Complete.RuntimeApi;
/*
const api = {} as typeof CodecKit.Complete.Api;
const empty = {} as TypeNode<number, number>;
const tests = {
  fork: api.item('fork', {
    control: empty,
    options: [
      { name: 'foo', match: [2], item: empty },
      { name: 'bar', match: [3], item: empty }
    ]
  }),
  custom: api.item('custom', {
    args: { size: 'byte' },
    construct: (args, api) => {
      const $uint = api.item('uint', { size: args.size as datasize });
      return {
        decode: (rom: Rom, _api: RuntimeApi): number => {
          return $uint.decode(rom) * 2;
        },
        encode: (data: number, rom: Rom, _api: RuntimeApi) => {
          $uint.encode(data / 2, rom);
        }
      };
    }
  }),
  resolver: api.item('resolver', {
    self: {
      item: {
        $type: 'uint',
        size: 'word'
      }
    } as Dict,
    from: ['items'],
    toNode: function (self, { items }, api) {
      return api.item('list', {
        item: self.item as TypeNode<number, number>,
        mode: {
          key: 'length',
          arg: (items as Array<Dict>).length
        }
      });
    }
  })
};

console.log(tests);
*/

/* Range */

type RangeArgs <Item extends TypeNode = TypeNode> = {
  item: Item;
  org: number;
  warn?: number;
};

const range_schema = v.object({
  item: v.node(),
  org: v.uint(),
  warn: v.optional(v.uint()),
});

const Range = CodecKit.composite({
  alias: 'range',
  kind: 'passthrough', // TODO: Need to implement 'passthrough'
  rule: 'item',
  isValidArgs (args: Dict): args is RangeArgs {
    v.assert(range_schema, args);
    if (args.warn != null && args.warn <= args.org) {
      throw new Error(`Expected warn to be greater than org`);
    }
    return true;
  },
  construct <Item extends TypeNode> (
    { org, warn, item }: RangeArgs<Item>
  ) {
    const hex_org = hex(org, 'sword');
    const end = warn != null ? hex(warn, 'sword') : null;
    const $item = item;

    function $jsr <T> (rom: Rom, func: () => T): T {
      return rom.jsr({
        start: +hex_org,
        end: end ? +end : undefined
      }, func);
    }

    return CodecKit.instance<Item['<Data>'], Item['<Formatted>']>({
      decode: (rom) => {
        return $jsr(rom, () => $item.decode(rom));
      },
      encode: (data, rom) => {
        return $jsr(rom, () => $item.encode(data, rom));
      },
      format: (data) => {
        return $item.format(data);
      },
      parse: (data) => {
        return $item.parse(data);
      }
    });
  }
});

/* Modifier */

type ModifierArgs <
  Item extends TypeNode = TypeNode,
  Self extends Dict = Dict
> = {
  item: Item;
  self?: Self;
  decoder: (x: Item['<Data>'], rom: Rom, api: RuntimeApi) => Item['<Data>'];
  encoder: (x: Item['<Data>'], rom: Rom, api: RuntimeApi) => Item['<Data>'];
};

const modifier_schema = v.object({
  item: v.node(),
  self: v.optional(v.dict()),
  decoder: v.function(),
  encoder: v.function(),
});

const Modifier = CodecKit.composite({
  alias: 'modifier',
  kind: 'passthrough',
  rule: 'item',
  isValidArgs (args: Dict): args is ModifierArgs {
    v.assert(modifier_schema, args);
    return true;
  },
  construct <
    Item extends TypeNode,
    Self extends Dict
  > (
    { item, self, decoder, encoder }: ModifierArgs<Item, Self>
  ) {
    const $self = self || {};
    const $item = asNode(item);

    return CodecKit.instance<Item['<Data>'], Item['<Formatted>']>({
      decode: (rom, api) => {
        return decoder.call($self, $item.decode(rom), rom, api);
      },
      encode: (data, rom, api) => {
        $item.encode(encoder.call($self, data, rom, api), rom);
      },
      format: (data) => $item.format(data),
      parse: (data) => $item.parse(data)
    });
  }
});

/* View */

type ViewArgs <
  Item extends TypeNode = TypeNode,
  F = unknown
> = {
  item: Item;
  self?: Dict;
  formatter: (data: Item['<Data>'], api: RuntimeApi) => F;
  parser: (formatted: F, api: RuntimeApi) => Item['<Data>'];
};

const view_schema = v.object({
  item: v.node(),
  self: v.optional(v.dict()),
  formatter: v.function(),
  parser: v.function(),
});

const View = CodecKit.composite({
  alias: 'view',
  kind: 'passthrough',
  rule: 'view',
  isValidArgs (args: Dict): args is ViewArgs {
    v.assert(view_schema, args);
    return true;
  },
  construct <
    Item extends TypeNode,
    Formatted
  > (
    { item, self, formatter, parser }: ViewArgs<Item, Formatted>
  ) {
    const $self = self || {};
    const $item = asNode(item);

    return CodecKit.instance<Item['<Data>'], Formatted>({
      decode: (rom) => {
        return $item.decode(rom);
      },
      encode: (data, rom) => {
        $item.encode(data, rom);
      },
      format: (data, api) => {
        return formatter.call($self, data, api);
      },
      parse: (formatted, api) => {
        return parser.call($self, formatted, api);
      }
    });
  }
});

/* Custom */

// "Any" here allows the fallback ArgsShape to constrain safely
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
type CustomArgs <Data = any, Formatted = Data, Input extends Dict = Dict> = {
  args?: Input;
  construct: (input: Input, api: CompileApi) => {
    decode?: (rom: Rom, api: RuntimeApi) => Data;
    encode?: (data: Data, rom: Rom, api: RuntimeApi) => void;
    format?: (data: Data, api: RuntimeApi) => Formatted;
    parse?: (data: Formatted, api: RuntimeApi) => Data;
  }
};

const custom_schema = v.object({
  args: v.optional(v.dict()),
  construct: v.function(),
});

const Custom = CodecKit.Complete.composite({
  alias: 'custom',
  kind: 'unknown',
  rule: 'custom',
  isValidArgs (args: Dict): args is CustomArgs {
    v.assert(custom_schema, args);
    return true;
  },
  construct <Data, Formatted, Input extends Dict> (
    input: CustomArgs<Data, Formatted, Input>,
    api: typeof CodecKit.Complete.Api
  ) {
    const { construct, args } = input;
    const $args = args || ({} as Input);
    const { decode, encode, format, parse } = construct($args, api);

    return CodecKit.Complete.instance<Data, Formatted>({
      decode: (rom, api) => {
        return decode?.(rom, api) || (null as Data);
      },
      encode: (data, rom, api) => {
        encode?.(data, rom, api);
      },
      format: (data, api) => {
        return format?.(data, api) || (null as Formatted);
      },
      parse: (data, api) => {
        return parse?.(data, api) || (null as Data);
      }
    });
  }
});

/* Fork */

type ForkControl = number | string | boolean;
type ForkMatchRange = { min: number; max: number };
type ForkMatchFunction = (value: unknown) => boolean;
type ForkMatch <T> = T | ForkMatchRange | ForkMatchFunction;
type ForkOption <ControlData extends ForkControl> = {
  name: string;
  item: TypeNode;
  match: ForkMatch<ControlData>[];
  omit_control?: boolean;
};
type ForkOptions <
  ControlData extends ForkControl
> = readonly ForkOption<ControlData>[];

type ForkArgs <
  ControlNode extends TypeNode<ForkControl, unknown> =
    TypeNode<ForkControl, unknown>,
  Options extends ForkOptions<ControlNode['<Data>']> =
    ForkOptions<ControlNode['<Data>']>
> = {
  control: ControlNode;
  readonly options: Options;
};

type ForkDataFor<
  ControlData extends ForkControl,
  Options extends ForkOptions<ControlData>
> = {
  [I in keyof Options]: {
    name: Options[I]['name'];
    value: Options[I]['item']['<Data>'];
  };
}[number];

type ForkFormattedFor<
  ControlData extends ForkControl,
  Options extends ForkOptions<ControlData>
> = {
  [I in keyof Options]: (Options[I]['item']['kind'] extends 'void'
    ? Options[I]['name']
    : Record<Options[I]['name'], Options[I]['item']['<Formatted>']>
  );
}[number];

const options_schema = v.array(
  v.object({
    name: v.string(),
    item: v.node(),
    match: v.array(v.any()),
    omit_control: v.optional(v.boolean()),
  })
);

const fork_schema = v.object({
  control: v.node(),
  options: options_schema
});

const Fork = CodecKit.composite({
  alias: 'fork',
  kind: 'object',
  rule: 'fork',
  // Tranform option object into array of options with "name" field containing key
  normalizeArgs (args) {
    const { options: raw_options, ...rest } = args;
    let options = isObj(raw_options) ? Object.keys(raw_options).map(name => {
      return Object.assign({ name }, raw_options[name]);
    }) : raw_options;

    if (Array.isArray(options)) {
      options = options.map(option => {
        const new_option = { ...option };
        // Allow using legacy "code" alias for match
        if ('code' in new_option && !('match' in new_option)) {
          new_option.match = [new_option.code];
          new_option.omit_control = true;
          delete new_option.code;
        }
        // Allow specifying single match for convenience
        if ('match' in new_option && !Array.isArray(new_option.match)) {
          new_option.match = [new_option.match];
        }
        return new_option;
      });
    }

    return { ...rest, options };
  },
  isValidArgs (args: Dict): args is ForkArgs {
    v.assert(fork_schema, args);
    const control_kind = args.control.kind;
    if (!['number', 'boolean', 'string'].includes(control_kind)) {
      throw new Error([
        `Expected fork control to return type: number, boolean, or string.`,
        `Found ${control_kind}`
      ].join(' '));
    }
    const names = new Set<string>();
    for (const option of args.options) {
      names.add(option.name);
      if ('code' in option) {
        throw new Error(`Code field should not exist on options`);
      }
      if ('omit_control' in option) {
        if (option.match.length !== 1 || typeof option.match[0] !== control_kind) {
          throw new Error('Omit control only allowed for single fixed match');
        }
      }
      for (const match of option.match) {
        if (!isObj(match) && typeof match !== control_kind && typeof match !== 'function') {
          throw new Error(`Expected match to be range object, function, or to align with control`);
        }
        if (isObj(match)) {
          if (control_kind !== 'number') {
            throw new Error(`Control must return a number for option range matches`);
          }
          for (const key of ['min', 'max']) {
            if (!(key in match)) {
              throw new Error(`Expected option range match to have prop ${key}`);
            }
            if (typeof match[key] !== 'number') {
              throw new Error(`Expected option match ${key} to be a number`);
            }
          }
        }
      }
    }
    if (names.size !== args.options.length) {
      throw new Error(`Multiple options using same name identifier`);
    }

    return true;
  },
  construct <
    ControlNode extends TypeNode<ForkControl, unknown>,
    const Options extends ForkOptions<ControlNode['<Data>']>
  > ({ control, options }: ForkArgs<ControlNode, Options>) {
    type OptionLookup = {
      [Option in Options[number] as Option['name']]: Option
    };
    type ControlData = ControlNode['<Data>'];
    type OptionName = Options[number]['name'];
    type ForkData = ForkDataFor<ControlData, Options>;
    type ForkFormatted = ForkFormattedFor<ControlData, Options>;

    const $control = control;
    const $lookup = $getLookup(options);
    const $fork = $getForkFunc(options);

    function $getOption (name: OptionName, api: RuntimeApi) {
      api.trace('fork_option', name);
      const option = $lookup[name];
      if (!option) {
        throw new Error(`Option "${name}" not found in lookup`);
      }
      return option as Options[number];
    }

    function $getLookup (options: Options) {
      return Object.fromEntries(options.map(option => {
        return [option.name, option];
      })) as OptionLookup;
    }

    function $getForkFunc (options: Options) {
      const codes = new Map<ControlData, string>();
      const ranges = new Map<ForkMatchRange, string>();
      const funcs = new Map<ForkMatchFunction, string>();

      for (const { name, match: matches } of options) {
        for (const match of matches) {
          switch (typeof match) {
            case 'object':
              ranges.set(match, name);
              break;
            case 'function':
              funcs.set(match, name);
              break;
            default: {
              codes.set(match, name);
            }
          }
        }
      }

      return (value: ControlData): OptionName => {
        if (codes.has(value)) {
          return codes.get(value)!;
        }
        for (const [range, name] of ranges) {
          const num = value as number;
          if (range.min <= num && num <= range.max) {
            return name;
          }
        }
        for (const [func, name] of funcs) {
          if (func(value)) {
            return name;
          }
        }
        throw new Error(`No option found for control value "${value}"`);
      };
    }

    return CodecKit.instance<ForkData, ForkFormatted>({
      decode: (rom, api) => {
        const offset = rom.offset();
        const control_value = $control.decode(rom);
        const name = $fork(control_value);
        const option = $getOption(name, api);

        if (!option.omit_control) {
          rom.offset(offset); // Rewind cursor for decode below
        }

        return {
          name,
          value: option.item.decode(rom)
        } as ForkData; // Not the best cast...
      },
      encode: (data, rom, api) => {
        const { name, value } = data;
        const option = $getOption(name, api);

        if (option.omit_control) {
          $control.encode(option.match[0] as ControlData, rom);
        }

        return option.item.encode(value, rom);
      },
      format: (data, api) => {
        const { name, value } = data;
        const option = $getOption(name, api);
        const child = option.item.format(value);
        return (
          option.item.kind === 'void' ? name : { [name]: child }
        ) as ForkFormatted; // Not the best cast...
      },
      parse: (data, api) => {
        const child = isStr(data) ? { [data]: undefined } : data;
        const [name, value] = Object.entries(child)[0]!;
        const option = $getOption(name, api);
        const parsed = option.item.parse(value);
        return { name, value: parsed };
      }
    });
  }
});

/* Script */

type ScriptArgs <
  ControlNode extends TypeNode<ForkControl, unknown> = TypeNode<ForkControl, unknown>,
  Options extends ForkOptions<ControlNode['<Data>']> = ForkOptions<ControlNode['<Data>']>
> = ForkArgs<ControlNode, Options> & {
  mode: ListModeSpec<ForkDataFor<ControlNode['<Data>'], Options>>
};

const script_schema = v.object({
  control: v.node(),
  options: options_schema,
  mode: list_mode_schema
});

const Script = CodecKit.from<{
  list: typeof List,
  fork: typeof Fork
}>().run(Kit => Kit.composite({
  alias: 'script',
  kind: 'array',
  rule: 'script',
  normalizeArgs (args: Dict) {
    if (!args.mode) {
      for (const key of ['eol', 'length', 'until']) {
        if (args[key]) {
          args = { ...args, mode: { key, arg: args[key] } };
          break;
        }
      }
    }
    return args;
  },
  isValidArgs (_args: Dict): _args is ScriptArgs {
    v.assert(script_schema, _args);
    return true;
  },
  construct <
    ControlNode extends TypeNode<ForkControl, unknown>,
    const Options extends ForkOptions<ControlNode['<Data>']>
  > (
    args: ScriptArgs<ControlNode, Options>,
    api: typeof Kit.Api
  ) {
    const $script = api.item('list', {
      mode: args.mode,
      item: api.item('fork', {
        control: args.control,
        options: args.options
      })
    });
    return passthrough($script);
  }
}));

/* Resolver */
// TODO: Promote Resolver alongside api.item() and improve

type ResolverArgs <
  Data = unknown,
  Formatted = unknown,
  From extends readonly string[] = readonly string[],
  Self extends Dict = Dict
> = {
  self: Self;
  from: From;
  toNode: (
    self: Self,
    data: Record<From[number], unknown>,
    api: RuntimeApi
  ) => TypeNode<Data, Formatted>
};

const resolver_schema = v.object({
  self: v.optional(v.dict()),
  from: v.array(v.string()),
  toNode: v.function(),
});

const Resolver = CodecKit.Complete.composite({
  alias: 'resolver',
  kind: 'unknown',
  rule: 'custom',
  normalizeArgs (args) {
    // Allow singular "from" string
    const { from: raw_from, ...rest } = args;
    const from = Array.isArray(raw_from) ? raw_from : [raw_from];
    return { from, ...rest };
  },
  isValidArgs (args: Dict): args is ResolverArgs {
    v.assert(resolver_schema, args);
    return true;
  },
  construct <
    Data,
    Formatted,
    From extends readonly string[],
    Self extends Dict
  > (
    { self, from, toNode }: ResolverArgs<Data, Formatted, From, Self>
  ) {
    const $getNode = (
      api: typeof CodecKit.Complete.RuntimeApi
    ): TypeNode => {
      return api.scratch(() => {
        const data = Object.fromEntries(
          from.map(schema_id => [schema_id, api.fetch(schema_id)])
        ) as Record<From[number], unknown>;

        return toNode(self, data, api);
      });
    };

    return CodecKit.Complete.instance<Data, Formatted>({
      decode: (rom, api) => {
        return $getNode(api).decode(rom) as Data;
      },
      encode: (data, rom, api) => {
        $getNode(api).encode(data, rom);
      },
      format: (data, api) => {
        return $getNode(api).format(data) as Formatted;
      },
      parse: (data, api) => {
        return $getNode(api).parse(data) as Data;
      }
    });
  }
});

type EntityArgs = {
  size: datasize;
  from: string;
  path: string[];
  inject?: NumDict<string>
};

const entity_schema = v.object({
  size: v.datasize(),
  from: v.string(),
  path: v.array(v.string()),
  inject: v.optional(v.num_dict(v.string())),
});

const Entity = CodecKit.from<{
  uint: typeof Uint
}>().simple({
  alias: 'entity',
  kind: 'number', // TODO: Technically, formatted is string...
  isValidArgs (args: Dict): args is EntityArgs {
    v.assert(entity_schema, args);
    return true;
  },
  construct ({ size, from, path, inject = {} }, api) {
    const $uint = api.item('uint', { size });
    const $lib_id = [from, ...path].join('|');
    const $from = from;
    const $path = path;
    const $lookup = Lookup.fromNumRecord(inject);

    function $getEnum (api: RuntimeApi) {
      return api.transform($from, (data: unknown) => {
        if (!Array.isArray(data)) {
          throw new Error(`Entity node expects "${$from}" data to be an array`);
        }
        const table = data as unknown[];
        const seen = new Set<string>();
        const enum_array = table.map((ent, i) => {
          const raw_value = getAtPath(ent, $path);
          if (!isStr(raw_value)) {
            throw new Error(`Path ${$path} does not yield string for ${$from}`);
          }
          const value = (seen.has(raw_value)
            ? `${raw_value}[${i}]`
            : raw_value
          );
          seen.add(value);
          return value;
        });

        api.setLib!($lib_id, enum_array);
        return enum_array;
      });
    }

    return {
      decode: (rom) => {
        return $uint.decode(rom);
      },
      encode: (uint, rom) => {
        return $uint.encode(uint, rom);
      },
      format: (index, api) => {
        if ($lookup.hasKey(index)) {
          return $lookup.byKey(index);
        } else {
          return $getEnum(api)[index]!;
        }
      },
      parse: (value, api) => {
        if ($lookup.hasValue(value)) {
          return $lookup.byValue(value);
        } else {
          const enums = api.getLib!($lib_id) as string[];
          return enums.indexOf(value);
        }
      }
    };
  }
});

export {
  Range,
  Modifier,
  View,
  Custom,
  Fork,
  Script,
  Resolver,
  Entity
};

export type {
  ForkOptions,
  ForkDataFor
};
