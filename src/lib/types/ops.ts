import { Lookup, hex, AbstractPassthrough, getAtPath } from './utils.js';
import type { Hex } from './utils.js';
import type { ListModeConfig } from './collections.js';

import {
  TypeNode,
} from '../type-registry.js';

import type {
  TypeAlias,
  CompileApi,
  RuntimeApi,
  Item,
  Rom,
  datasize
} from '../type-registry.js';

// --- Component Types & Classes ---

type RangeArgs = {
  org: number;
  warn?: number;
  item: TypeNode;
};

class Range {
  static readonly alias = 'range';
  static readonly kind = 'unknown'; // TODO: Need to revisit "kind"

  #org: Hex;
  #end: Hex | null;
  #item: TypeNode;

  constructor ({ org, warn, item }: RangeArgs) {
    this.#org = hex(org, 'sword');
    this.#end = warn != null ? hex(warn, 'sword') : null;
    this.#item = item;
  }

  static isValidArgs (args: Record<string, unknown>): args is RangeArgs {
    if (!(args.item instanceof TypeNode)) {
      throw new Error(`Expected range item to be a TypeNode. Found ${args.item}`);
    }
    if (!isUint(args.org)) {
      throw new Error(`Expected org to be uint. Found ${args.org}`);
    }
    if (args.warn != null) {
      if (!isUint(args.warn)) {
        throw new Error(`Expected warn to be uint. Found ${args.org}`);
      }
      if (args.warn <= args.org) {
        throw new Error(`Expected warn to be greater than org`);
      }
    }
    return true;
  }

  #jsr <T> (rom: Rom, func: () => T): T {
    return rom.jsr({
      start: +this.#org,
      end: this.#end ? +this.#end : undefined
    }, func);
  }

  decode (rom: Rom): unknown {
    return this.#jsr(rom, () => this.#item.decode(rom));
  }

  encode (data: unknown, rom: Rom): void {
    return this.#jsr(rom, () => this.#item.encode(data, rom));
  }

  format (data: unknown): unknown {
    return this.#item.format(data);
  }

  parse (data: unknown): unknown {
    return this.#item.parse(data);
  }
}

/* Fork */

type ForkMatchRange = { min: number; max: number };
type ForkMatchFunction = (value: unknown) => boolean;
type ForkMatch = number | ForkMatchRange | ForkMatchFunction;
type ForkOption = (
  | { subfork: ForkArgs }
  | { item: TypeNode }
) & (
  | { code: number }
  | { match: ForkMatch[] }
);
type ResolvedOption = ForkOption & {
  name: string;
};
type ForkArgs = {
  control: TypeNode;
  options: Record<string, ForkOption>;
};
type ForkItem = {
  name: string;
  value: unknown;
};

class Fork {
  static readonly alias = 'fork';
  static readonly kind = 'object';

  #control: TypeNode;
  #fork: (value: unknown) => string;
  #subforks: Map<string, Fork>;
  lookup: Map<string, ResolvedOption>;

  constructor ({ control, options }: ForkArgs) {
    const [subforks, lookup] = this.#getSubforks(options);
    this.#control = control;
    this.#fork = this.#getFork(options);
    this.#subforks = subforks;
    this.lookup = lookup;
  }

  static isValidArgs (args: Record<string, unknown>): args is ForkArgs {
    if (!(args.control instanceof TypeNode)) {
      throw new Error(`Expected control to be a TypeNode. Found ${args.control}`);
    }
    if (!isObj(args.options)) {
      throw new Error(`Expected options to be object. Found ${args.options}`);
    }
    for (const option of Object.values(args.options)) {
      if (!isObj(option)) {
        throw new Error(`Expected option to be an object. Found ${option}`);
      }
      if (!hasOnlyOne(option, ['subfork', 'item'])) {
        throw new Error(`Option must have either "item" or "subfork"`);
      }
      if ('item' in option && !(option.item instanceof TypeNode)) {
        throw new Error(`Expected option item to be a TypeNode`);
      }
      if (!hasOnlyOne(option, ['code', 'match'])) {
        throw new Error(`Option must have either "code" or "match" strategy`);
      }
      if ('code' in option && !isUint(option.code)) {
        throw new Error(`Expected option.code to be uint. Found ${option.code}`);
      }
      if ('match' in option) {
        if (!Array.isArray(option.match)) {
          throw new Error(`Expected option.match to be an Array`);
        }
        for (const match of option.match) {
          if (!isObj(match) && !isUint(match) && typeof match !== 'function') {
            throw new Error(`Expected match to be object, uint, or function`);
          }
          if (isObj(match)) {
            for (const key of ['min', 'max']) {
              if (!(key in match)) {
                throw new Error(`Expected option match to have prop ${key}`);
              }
              if (typeof match[key] !== 'number') {
                throw new Error(`Expected option match ${key} to be a number`);
              }
            }
          }
        }
      }
    }

    return true;
  }

  decode (rom: Rom): ForkItem {
    const offset = rom.offset();
    const control_value = this.#control.decode(rom);
    const name = this.#fork(control_value);
    const option = this.lookup.get(name);

    if (!option) {
      throw new Error(`Option "${name}" not found in lookup`);
    }

    if (!Object.hasOwn(option, 'code')) {
      rom.offset(offset);
    }

    if ('subfork' in option) {
      return this.#subforks.get(name)!.decode(rom);
    } else {
      return { name, value: option.item.decode(rom) };
    }
  }

  encode (data: ForkItem, rom: Rom): void {
    const { name, value } = data;
    const option = this.lookup.get(name);

    if (!option) {
      throw new Error(`Option "${name}" not found in lookup`);
    }

    if ('code' in option) {
      this.#control.encode(option.code, rom);
    }

    if ('subfork' in option) {
      return this.#subforks.get(option.name)!.encode(data, rom);
    } else {
      return option.item.encode(value, rom);
    }
  }

  parse (data: string | Record<string, unknown>): ForkItem {
    const item = typeof data === 'string' ? { [data]: undefined } : data;
    const [name, value] = Object.entries(item)[0]!;
    const option = this.lookup.get(name)!;

    if ('subfork' in option) {
      return this.#subforks.get(option.name)!.parse(item);
    } else {
      const parsed = option.item.parse(value);
      return { name, value: parsed };
    }
  }

  format (data: ForkItem): string | Record<string, unknown> {
    const { name, value } = data;
    const option = this.lookup.get(name)!;

    if ('subfork' in option) {
      return this.#subforks.get(option.name)!.format(data);
    } else {
      const formatted = option.item.format(value);
      return formatted === undefined ? name : { [name]: formatted };
    }
  }

  #getSubforks (options: Record<string, ForkOption>) {
    const subforks = new Map<string, Fork>();
    const lookup = new Map<string, ResolvedOption>();

    for (const parent in options) {
      const option = { ...options[parent]!, name: parent };
      lookup.set(parent, option);

      if ('subfork' in option) {
        const subfork = new Fork(option.subfork);
        subforks.set(parent, subfork);

        for (const descendant of subfork.lookup.keys()) {
          lookup.set(descendant, option);
        }
      }
    }

    return [subforks, lookup] as const;
  }

  #getFork (options: Record<string, ForkOption>) {
    const codes = new Map<number, string>();
    const ranges = new Map<ForkMatchRange, string>();
    const funcs = new Map<ForkMatchFunction, string>();

    for (const name in options) {
      const option = options[name]!;
      const matches = 'match' in option ? option.match : [option.code];

      for (const match of matches) {
        switch (typeof match) {
          case 'number':
            codes.set(match, name);
            break;
          case 'object':
            ranges.set(match, name);
            break;
          case 'function':
            funcs.set(match, name);
            break;
          default: {
            throw new Error(`Invalid option match type ${typeof match}`);
          }
        }
      }
    }

    return (value: unknown) => {
      const num = value as number;

      if (codes.has(num)) {
        return codes.get(num)!;
      }
      for (const [range, name] of ranges) {
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
}

type ScriptArgs = {
  control: TypeNode;
  options: Record<string, ForkOption>;
} & ListModeConfig;

class Script extends AbstractPassthrough<
  Item<'list'>,
  ForkItem[],
  Record<string, unknown>[]
> {
  static readonly alias = 'script' as const;

  constructor({ control, options, ...mode }: ScriptArgs, api: CompileApi) {
    super({
      item: api.item('list', {
        item: api.item('fork', { control, options }),
        ...mode
      })
    });
  }
}

type DecoratorArgs = {
  item: TypeNode;
  format: (data: unknown) => unknown;
  parse: (data: unknown) => unknown;
};

class Decorator extends AbstractPassthrough<TypeNode> {
  static readonly alias = 'format';

  #format: (data: unknown) => unknown;
  #parse: (data: unknown) => unknown;

  constructor ({ item, format, parse }: DecoratorArgs) {
    super({ item });
    this.#format = format;
    this.#parse = parse;
  }

  static isValidArgs (args: Record<string, unknown>): args is DecoratorArgs {
    if (!(args.item instanceof TypeNode)) {
      throw new Error(`Expected item to be a TypeNode. Found ${args.item}`);
    }
    if (typeof args.format !== 'function') {
      throw new Error(`Expected format to be a function`);
    }
    if (typeof args.parse !== 'function') {
      throw new Error(`Expected parse to be a function`);
    }

    return true;
  }

  override format (data: unknown): unknown {
    return this.#format(super.format(data));
  }

  override parse (data: unknown): unknown {
    return super.parse(this.#parse(data));
  }
}

type DecrypterArgs = {
  item: TypeNode;
  decrypt: (data: unknown) => unknown;
  encrypt: (data: unknown) => unknown;
};

class Decrypter extends AbstractPassthrough<TypeNode> {
  static readonly alias = 'decrypt';

  #decrypt: (data: unknown) => unknown;
  #encrypt: (data: unknown) => unknown;

  constructor ({ item, decrypt, encrypt }: DecrypterArgs) {
    super({ item });
    this.#decrypt = decrypt;
    this.#encrypt = encrypt;
  }

  static isValidArgs (args: Record<string, unknown>): args is DecrypterArgs {
    if (!(args.item instanceof TypeNode)) {
      throw new Error(`Expected item to be a TypeNode. Found ${args.item}`);
    }
    if (typeof args.decrypt !== 'function') {
      throw new Error(`Expected decode to be a function`);
    }
    if (typeof args.encrypt !== 'function') {
      throw new Error(`Expected encode to be a function`);
    }

    return true;
  }

  override decode (rom: Rom): unknown {
    return this.#decrypt(super.decode(rom));
  }

  override encode (data: unknown, rom: Rom): void {
    return super.encode(this.#encrypt(data), rom);
  }
}

type CustomArgs = {
  construct?: (input: unknown, api: CompileApi) => Record<string, unknown>;
  args?: Record<string, unknown>;
  decode?: (rom: Rom, api: RuntimeApi) => unknown;
  encode?: (data: unknown, rom: Rom, api: RuntimeApi) => void;
  format?: (data: unknown, api: RuntimeApi) => unknown;
  parse?: (data: unknown, api: RuntimeApi) => unknown;
};

class Custom {
  static readonly alias = 'custom';
  static readonly kind = 'unknown';

  #self: Record<string, unknown>;
  #decode: NonNullable<CustomArgs['decode']>;
  #encode: NonNullable<CustomArgs['encode']>;
  #format: NonNullable<CustomArgs['format']>;
  #parse: NonNullable<CustomArgs['parse']>;

  constructor (input: CustomArgs, api: CompileApi) {
    this.#self = input.construct?.(input.args, api) || {};
    this.#decode = input.decode || Custom.noop;
    this.#encode = input.encode || Custom.noop;
    this.#format = input.format || Custom.noop;
    this.#parse = input.parse || Custom.noop;
  }
  static isValidArgs (args: Record<string, unknown>): args is CustomArgs {
    if (args.construct != null && args.construct !== 'function') {
      throw new Error(`Expected construct to be null or function`);
    }
    if (args.construct == null && args.args != null) {
      throw new Error(`Args only supported alongside construct() field`);
    }
    if (args.args != null && !isObj(args.args)) {
      throw new Error(`Expected args to be an object`);
    }
    for (const key of ['decode', 'encode', 'format', 'parse']) {
      if (key in args && typeof args[key] !== 'function') {
        throw new Error(`Expected ${key} to be undefined or a function`);
      }
    }
    return true;
  }
  decode (rom: Rom, api: RuntimeApi): unknown {
    return this.#decode.call(this.#self, rom, api);
  }
  encode (data: unknown, rom: Rom, api: RuntimeApi): void {
    this.#encode.call(this.#self, data, rom, api)
  }
  format (data: unknown, api: RuntimeApi): unknown {
    return this.#format.call(this.#self, data, api);
  }
  parse (data: unknown, api: RuntimeApi): unknown {
    return this.#parse.call(this.#self, data, api);
  }
  static noop = () => {};
}

type TransformerArgs = {
  ref: string;
  type: TypeAlias;
  transform: (data: unknown) => unknown;
};

class Transformer {
  static readonly alias = 'transformer';

  #ref: string;
  #type: TypeAlias;
  #transform: (data: unknown) => unknown;

  constructor({ ref, type, transform }: TransformerArgs) {
    this.#ref = ref;
    this.#transform = transform;
    this.#type = type;
  }

  static isValidArgs (args: Record<string, unknown>): args is TransformerArgs {
    if (typeof args.ref !== 'string') {
      throw new Error(`Expected ref to be a string`);
    }
    if (typeof args.type !== 'string') {
      throw new Error(`Expected type to be a string`);
    }
    if (typeof args.transform !== 'function') {
      throw new Error(`Expected transform to be a function`);
    }
    return true;
  }

  #item (api: RuntimeApi): TypeNode {
    return api.transform(this.#ref, api.scratch(() => {
      return (data: unknown) => {
        // @ts-expect-error transform() output not type-checked
        return api.item(this.#type, this.#transform(data));
      };
    }));
  }

  decode (rom: Rom, api: RuntimeApi): unknown {
    return this.#item(api).decode(rom);
  }

  encode (data: unknown, rom: Rom, api: RuntimeApi): void {
    return this.#item(api).encode(data, rom);
  }

  parse (data: unknown, api: RuntimeApi): unknown {
    return this.#item(api).parse(data);
  }

  format (data: unknown, api: RuntimeApi): unknown {
    return this.#item(api).format(data);
  }
}

type MathOp = {
  op: 'add' | 'multiply';
  arg: number;
};

type MathsArgs = {
  math: MathOp[];
  item: TypeNode;
};

class Maths extends AbstractPassthrough<TypeNode> {
  static readonly alias = 'math';
  static readonly kind = 'number';

  #maths: MathOp[];

  constructor ({ math, item }: MathsArgs) {
    super({ item });
    this.#maths = math;
  }

  isValidArgs (args: Record<string, unknown>): args is MathsArgs {
    if (!(args.item instanceof TypeNode)) {
      throw new Error(`Expected math item to be a TypeNode. Found ${args.item}`);
    }
    if (!Array.isArray(args.math)) {
      throw new Error(`Expected math to be an Array`);
    }
    for (const math of args.math) {
      if (!isObj(math)) {
        throw new Error(`Expected math entry to be an object`);
      }
      if (!['add', 'multiply'].includes(math.op as string)) {
        throw new Error(`Expected valid math op. Found ${math.op}`); 
      }
    }
    return true;
  }

  override decode (rom: Rom): number {
    let val = super.decode(rom) as number;

    for (const { op, arg } of this.#maths) {
      switch (op) {
        case 'add':
          val = val + arg;
          break;
        case 'multiply': {
          val = val * arg;
          break;
        }
      }
    }

    return val;
  }

  override encode (data: number, rom: Rom): void {
    for (let i = this.#maths.length - 1; i >= 0; --i) {
      const { op, arg } = this.#maths[i]!;

      switch (op) {
        case 'add':
          data = data - arg;
          break;
        case 'multiply': {
          data = Math.round(data / arg);
          break;
        }
      }
    }

    return super.encode(data, rom);
  }
}

type RefPathArgs = {
  size: datasize;
  ref: string;
  path?: string;
  inject?: Record<number, string>;
};

class RefPath {
  static readonly alias = 'ref_path';

  #uint: Item<'uint'>;
  #id: string;
  #ref: string;
  #path: string[];
  #lookup: Lookup<number, string>;

  constructor ({ size, ref, path, inject = {} }: RefPathArgs, api: CompileApi) {
    this.#uint = api.item('uint', { size });
    this.#id = [ref, path].join('|');
    this.#ref = ref;
    this.#path = path ? path.split('.') : [];
    this.#lookup = Lookup.fromNumRecord(inject);
  }

  static isValidArgs (args: Record<string, unknown>): args is RefPathArgs {
    if (typeof args.ref !== 'string') {
      throw new Error(`Expected ref to be a string`);
    }
    if (args.path != null) {
      if (typeof args.path !== 'string') {
        throw new Error(`Expected path to be a string. Found ${args.path}`);
      }
    }
    if (args.inject != null) {
      if (!isObj(args.inject)) {
        throw new Error(`Expected inject to be object. Found ${args.inject}`);
      }
      for (const [key, value] of Object.entries(args.inject)) {
        if (!isUint(+key)) {
          throw new Error(`Expected inject keys to be uints`);
        }
        if (typeof value !== 'string') {
          throw new Error(`Expected inject values to be strings`);
        }
      }
    }
    return true;
  }

  #getEnum (api: RuntimeApi) {
    return api.transform(this.#ref, (ref_array: unknown) => {
      const seen = new Set<string>();
      const enum_array = (ref_array as unknown[]).map((ent, i) => {
        const raw_value = getAtPath(ent, this.#path) as string;
        const value = seen.has(raw_value) ? `${raw_value}[${i}]` : raw_value;
        seen.add(value);
        return value;
      });

      api.setLib!(this.#id, enum_array);
      return enum_array;
    });
  }

  decode (rom: Rom) {
    return this.#uint.decode(rom);
  }

  encode (uint: number, rom: Rom) {
    return this.#uint.encode(uint, rom);
  }

  format (index: number, api: RuntimeApi): string {
    if (this.#lookup.hasKey(index)) {
      return this.#lookup.by_key(index);
    } else {
      return this.#getEnum(api)[index]!;
    }
  }

  parse (value: string, api: RuntimeApi): number {
    if (this.#lookup.hasValue(value)) {
      return this.#lookup.by_value(value);
    } else {
      const enums = api.getLib!(this.#id)! as string[];
      return enums.indexOf(value);
    }
  }
}

// Misc helpers

function isUint (x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0;
}
function isObj (x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === 'object';
}
function hasOnlyOne (obj: Record<string, unknown>, keys: string[]) {
  return keys.filter(k => k in obj).length === 1;
}

export {
  Range,
  Fork,
  Script,
  Decorator,
  Decrypter,
  Custom,
  Transformer,
  Maths,
  RefPath
};
