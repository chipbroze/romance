import { deepEqualTry } from '../assert.js';
import { Lookup } from './utils.js';
import { TypeNode, Rom } from '../type-registry.js';
import type {
  Item,
  ItemData,
  //NodeData,
  //NodeFormat,
  CompileApi,
  RuntimeApi,
  datasize
} from '../type-registry.js';

const { getSize, sizeBytes } = Rom;

interface ListMode {
  ended: (list: unknown[], rom: Rom) => boolean;
  valid?: (list: unknown[], rom: Rom) => unknown[] | null;
}

type ListModeConfig =
  | { length: number }
  | { eol: unknown }
  | { end_at: unknown | unknown[] }
  | { custom: ListMode };

type ListArgs = {
  item: TypeNode;
} & ListModeConfig;

class List {
  static readonly alias = 'list';
  static readonly kind = 'array';

  item: TypeNode;
  ended: ListMode['ended'];
  valid: NonNullable<ListMode['valid']>;

  static modes = {
    length: (length: number): ListMode => ({
      ended: (list) => list.length === length
    }),
    eol: (arg: unknown): ListMode => ({
      valid: (list) => list.concat(arg),
      ended: (list) => {
        const last = list[list.length - 1];
        if (list.length > 0 && deepEqualTry(last, arg)) {
          list.pop();
          return true;
        }
        return false;
      }
    }),
    end_at: (arg: unknown): ListMode => {
      const args = Array.isArray(arg) ? arg : [arg];
      const maxVal = Math.max(...args.filter(a => typeof a === 'number'));
      const size = getSize(maxVal) ?? 'byte';

      return {
        valid: (list) => list,
        ended: (_list, rom) => {
          const next = rom.peek(() => rom.read(size));
          return args.some((a) =>
            typeof a === 'function' ? a(next) : deepEqualTry(next, a)
          );
        },
      };
    },
  };

  constructor({ item, ...mode_config }: ListArgs) {
    this.item = item;

    const mode = ('custom' in mode_config
      ? mode_config.custom
      : this.#getMode(mode_config)
    );

    this.ended = mode.ended;
    this.valid = mode.valid ?? (
      (list, rom) => this.ended(list, rom) ? list : null
    );
  }

  #getMode (mode_config: ListModeConfig): ListMode {
    const keys = (
      Object.keys(List.modes) as Array<keyof typeof List.modes>
    ).filter(key => key in mode_config);

    if (keys.length !== 1) {
      throw new Error('Must specify exactly one mode for list');
    }

    const type = keys[0]!;
    const args = (mode_config as Record<string, unknown>)[type];
    return (
      List.modes[type] as (a: typeof args) => ListMode
    )(args);
  }

  #trace (i: number, api: RuntimeApi) {
    api.trace('list_index', i.toString());
  }

  decode (rom: Rom, api: RuntimeApi): unknown[] {
    const list = [];
    while (!this.ended(list, rom)) {
      this.#trace(list.length, api);
      list.push(this.item.decode(rom));
    }
    return list;
  }

  encode (list: unknown[], rom: Rom, api: RuntimeApi): void {
    const valid_list = this.valid(list, rom);
    if (!valid_list) {
      throw new Error('List is not terminated properly');
    }

    valid_list.forEach((value, i) => {
      this.#trace(i, api);
      this.item.encode(value, rom);
    });
  }

  format (data: unknown[], api: RuntimeApi): unknown[] {
    return data.map((item, i) => {
      this.#trace(i, api);
      return this.item.format(item);
    });
  }

  parse (data: unknown[], api: RuntimeApi): unknown[] {
    return data.map((item, i) => {
      this.#trace(i, api);
      return this.item.parse(item);
    });
  }
}

type SegmentListArgs = {
  item: TypeNode;
  length: number;
  org: number;
  base: number;
  warn: number;
  size?: datasize
};

class SegmentList {
  static readonly alias = 'segment_list';
  static readonly kind = 'array';

  item: TypeNode;
  length: number;
  org: number;
  base: number;
  warn: number;
  pointer_list: Item<'list'>;

  constructor (
    { item, length, org, base, warn, size }: SegmentListArgs,
    api: CompileApi
  ) {
    size ??= 'word';
    base ??= org;

    this.item = item;
    this.length = length;
    this.org = org;
    this.base = base;
    this.warn = warn;
    this.pointer_list = api.item('list', {
      length: this.length + 1,
      item: api.item('uint', { size })
    });
  }
  decode (rom: Rom, api: RuntimeApi): unknown[][] {
    const eols = this.pointer_list.decode(rom).map(
      (p: unknown) => (p as ItemData<'uint'>) + this.base
    );
    let eol_index = 1;

    const sublist = api.item('list', {
      item: this.item,
      custom: {
        ended: (_list: unknown[], rom: Rom) => {
          if (rom.offset() === eols[eol_index]) {
            eol_index++;
            return true; 
          }
          return false;
        }
      }
    });

    const list = api.item('range', {
      org: this.org,
      warn: this.warn,
      item: api.item('list', {
        item: sublist,
        length: this.length
      })
    });

    return list.decode(rom) as unknown[][];
  }
  encode (sublists: unknown[][], rom: Rom, api: RuntimeApi): void {
    const eols = [this.org];
    const sublist = api.item('list', {
      item: this.item,
      custom: { ended: () => true }
    });
    const list = api.item('range', {
      org: this.org,
      warn: this.warn,
      item: api.item('list', {
        length: this.length,
        item: api.item('custom', {
          encode: (data: unknown, rom: Rom) => {
            sublist.encode(data as unknown[], rom);
            eols.push(rom.offset());
          }
        })
      })
    });

    list.encode(sublists, rom);
    const pointers = eols.map(eol => eol - this.base);
    return this.pointer_list.encode(pointers, rom);
  }
  parse (array: unknown[][]): unknown[][] {
    return array.map(item => {
      return item.map(subitem => this.item.parse(subitem));
    });
  }
  format (list: unknown[][]): unknown[][] {
    return list.map(item => {
      return item.map(subitem => this.item.format(subitem));
    });
  }
}

type StructField = {
  readonly name: string;
  readonly item: TypeNode;
};

// Return unknown Record because we aren't fully validating args yet
function normalizeFields (fields: unknown): Record<string, unknown>[] {
  return Array.isArray(fields) ? fields.map(parseOne) : [parseOne(fields)];

  function parseOne (field: unknown): Record<string, unknown> {
    if (field == null || typeof field !== 'object') {
      throw new Error(`Expected field to be an object. Found ${field}`);
    }

    let name: unknown;
    let item: unknown;

    if ('name' in field && 'item' in field) {
      name = field.name;
      item = field.item;
    } else {
      const entries = Object.entries(field);

      if (entries.length !== 1) {
        throw new Error([
          `Expected field shorthand to include exactly`,
          `one entry. Found ${entries.length}`
        ].join(' '));
      }

      name = entries[0]![0];
      item = entries[0]![1];
    }

    return { name, item };
  }
}
function isUint (num: unknown): num is number {
  return typeof num === 'number' && num >= 0 && Number.isInteger(num);
}

function isValidFields (fields: unknown): fields is StructField[] {
  if (!Array.isArray(fields)) {
    throw new Error(`Expected fields to be an array. Found ${fields}`);
  }
  for (const field of fields as Record<string, unknown>[]) {
    if (!field || typeof field !== 'object') {
      throw new Error(`Expected field to be an object. Found ${field}`);
    }
    if (typeof field.name !== 'string') {
      throw new Error(`Expected field name to be a string. Found ${field.name}`);
    }
    if (!(field.item instanceof TypeNode)) {
      throw new Error(`Expected field item to be a TypeNode. Found ${field.item}`);
    }
  }
  return true;
}

type StructData = Record<string, unknown>;
type StructArgs = {
  fields: StructField[];
};

class Struct {
  static readonly alias = 'struct';
  static readonly kind = 'object';

  fields: StructField[];
  field_set: Set<string>;

  constructor ({ fields }: StructArgs) {
    this.fields = fields;
    this.field_set = new Set(fields.map(f => f.name));
  }

  static normalizeArgs (args: Record<string, unknown>) {
    return {
      ...args,
      fields: normalizeFields(args.fields)
    };
  }

  static isValidArgs (args: Record<string, unknown>): args is StructArgs {
    return isValidFields(args.fields);
  }

  #trace (name: string, api: RuntimeApi) {
    api.trace('struct_field', name);
  }

  decode (rom: Rom, api: RuntimeApi): StructData {
    const result: Record<string, unknown> = {};

    for (const { name, item } of this.fields) {
      this.#trace(name, api);
      result[name] = item.decode(rom);
    }

    return result;
  }

  encode (data: StructData, rom: Rom, api: RuntimeApi): void {
    const record = data as Record<string, unknown>;

    for (const key in record) {
      if (!this.field_set.has(key)) {
        throw new Error(`Provided unhandled field "${key}" to struct`);
      }
    }

    for (const { name, item } of this.fields) {
      this.#trace(name, api);
      item.encode(record[name], rom);
    }
  }

  format (data: StructData, api: RuntimeApi): StructData {
    const record = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const { name, item } of this.fields) {
      this.#trace(name, api);
      result[name] = item.format(record[name]);
    }

    return result;
  }

  parse (data: StructData, api: RuntimeApi): StructData {
    const record = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const { name, item } of this.fields) {
      this.#trace(name, api);
      result[name] = item.parse(record[name]);
    }

    return result;
  }
}

type ArrayStructField = StructField & {
  item: TypeNode<unknown[]>;
};
type SplitItem = {
  kind: string;
  value: unknown;
};
type SplitData = SplitItem[];
type SplitFormat = unknown[];
type SplitStruct = Record<string, unknown[]>;
type SplitArgs = {
  id: string,
  fields: ArrayStructField[]
};

class SplitList {
  static readonly alias = 'split_list';
  static readonly kind = 'array';

  readonly #id: string;
  readonly #struct: Item<'struct'>;
  readonly #order: string[];

  constructor ({ id, fields }: SplitArgs, api: CompileApi) {
    this.#id = id;
    this.#struct = api.item('struct', { fields });
    this.#order = fields.map(field => field.name);
  }

  static normalizeArgs (args: Record<string, unknown>) {
    return {
      fields: normalizeFields(args.fields),
      ...args
    };
  }
  static isValidArgs (args: Record<string, unknown>): args is SplitArgs {
    if (!args.id || typeof args.id !== 'string') {
      throw new Error(`Expected unique ID. Found ${args.id}`);
    }
    if (!isValidFields(args.fields)) {
      throw new Error(`Invalid fields`);
    }
    if (args.fields.some(field => field.item.kind !== 'array')) {
      throw new Error(`Expected all items to be array/list types`);
    }

    return true;
  }

  #split (list: SplitData): SplitStruct {
    const obj = Object.fromEntries(
      this.#order.map(field => [field, [] as unknown[]])
    );
    list.forEach(item => {
      obj[item!.kind]!.push(item.value);
    });
    return obj;
  }
  #join (obj: SplitStruct): SplitData {
    return this.#order.flatMap(field => {
      return obj[field]!.map(value => ({ kind: field, value }));
    });
  }

  decode (rom: Rom): SplitData {
    const obj = this.#struct.decode(rom) as SplitStruct;
    return this.#join(obj);
  }
  encode (list: SplitData, rom: Rom): void {
    const obj = this.#split(list);
    return this.#struct.encode(obj, rom);
  }
  format (list: SplitData, api: RuntimeApi): SplitFormat {
    const obj = this.#split(list);
    const data = this.#struct.format(obj) as SplitStruct;
    const lists = this.#order.map(name => data[name] as unknown[]);
    api.setLib!(this.#id, lists.map(l => l.length));
    return lists.flat();
  }
  parse (list: SplitFormat, api: RuntimeApi): SplitData {
    const clone = list.slice();
    const lengths = api.getLib!(this.#id) as number[];
    const obj = lengths.reduce((obj, length, i) => {
      const name = this.#order[i]!;
      obj[name] = clone.splice(0, length);
      return obj;
    }, {} as Record<string, unknown[]>);

    return this.#join(this.#struct.parse(obj) as SplitStruct);
  }
}

type BitfieldField = {
  readonly name: string;
  readonly item: TypeNode;
  readonly mask: number;
  readonly shift?: number | null;
  readonly size?: datasize | null;
}

type BitfieldArgs = {
  size?: datasize;
  fields: BitfieldField[];
};

class Bitfield {
  static readonly alias = 'bitfield';
  static readonly kind = 'number';

  readonly #struct: Item<'struct'>;
  readonly #uint: Item<'uint'>;
  readonly #length: number;
  readonly #masks: {
    readonly mask: number;
    readonly shift: number;
    readonly size: datasize;
    readonly uint: Item<'uint'>;
  }[];

  constructor({ size, fields }: BitfieldArgs, api: CompileApi) {
    this.#struct = api.item('struct', { fields });
    this.#uint = api.item('uint', {
      size: size ?? Rom.getSize(
        Math.max(...fields.map(f => f.mask))
      )
    });
    const masks = fields.map(({ mask, shift, size }) => {
      if (shift == null) {
        shift = mask > 0 ? 31 - Math.clz32(mask & -mask) : 0;
      }
      if (size == null) {
        size = Rom.getSize(mask >>> shift);
      }
      return {
        mask,
        shift,
        size,
        uint: api.item('uint', { size })
      };
    });
    this.#masks = masks;
    this.#length = masks.reduce((length, mask) => {
      return length + Rom.sizeBytes(mask.size);
    }, 0);
  }

  static normalizeArgs (args: Record<string, unknown>) {
    let fields = args.fields;

    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      fields = Object.entries(fields).map(entry => {
        const [name, field] = entry;
        return { ...field, name };
      });
    }

    return {
      ...args,
      fields
    };
  }

  static isValidArgs (args: Record<string, unknown>): args is BitfieldArgs {
    if (!Array.isArray(args.fields)) {
      throw new Error(`Expected fields to be an array. Found ${args.fields}`);
    }

    for (const field of args.fields as Record<string, unknown>[]) {
      if (field.shift != null && !isUint(field.shift)) {
        throw new Error(`Expected field.shift to be number. Found ${field.shift}`);
      }
      if (field.size != null && !Rom.isValidSize(field.size)) {
        throw new Error(`Field.size is not valid: ${field.size}`);
      }
    }

    const total_bits = args.fields.reduce((total_bits, field) => {
      if (total_bits & field.mask) {
        throw new Error(`Overlapping mask for field ${field.name}`);
      }
      return (total_bits | field.mask) >>> 0;
    }, 0);

    if (total_bits > 0xFFFFFFFF) {
      throw new Error(`Cannot specify masks greater than 32 bits`);
    }

    if (args.size != null) {
      if (!Rom.isValidSize(args.size)) {
        throw new Error(`Input.size is not valid: ${args.size}`);
      }
      if (total_bits >= 2 ** (8 * sizeBytes(args.size))) {
        throw new Error(`Specified size (${args.size}) cannot accommodate masks`);
      }
    }

    return true;
  }

  decode (rom: Rom): StructData {
    const bitfield = this.#uint.decode(rom);

    return rom.mount(new Uint8Array(this.#length), () => {
      // First, write the field values to the virtual rom address
      rom.peek(() => {
        for (const { mask, shift, uint } of this.#masks) {
          const bits = bitfield & mask;
          const value = bits >>> shift;
          uint.encode(value, rom);
        }
      });
      // Then, read the values back with the full nodes
      return this.#struct.decode(rom);
    });
  }

  encode(data: StructData, rom: Rom): void {
    let bitfield = 0;

    rom.mount(new Uint8Array(this.#length), () => {
      rom.peek(() => {
        this.#struct.encode(data, rom);
      });

      for (const { mask, shift, uint } of this.#masks) {
        const value = uint.decode(rom);
        const shifted = ((value << shift) & mask) >>> 0;
        bitfield = (bitfield | shifted) >>> 0;
      }
    });

    this.#uint.encode(bitfield, rom);
  }

  format(data: StructData): StructData {
    return this.#struct.format(data);
  }

  parse(readable: StructData): StructData {
    return this.#struct.parse(readable);
  }
}

type BitmaskArgs = {
  readonly flags: readonly string[];
  readonly states?: Record<number, string>;
  readonly size?: datasize;
};
type BitmaskData = string[] | string;

class Bitmask {
  static readonly alias = 'bitmask';
  static readonly kind = 'array';

  readonly #bitfield: Item<'bitfield'>;
  readonly #uint: Item<'uint'>;
  readonly #flags: readonly string[];
  readonly #states: Lookup<number, string>;

  constructor({ size, flags, states }: BitmaskArgs, api: CompileApi) {
    this.#flags = flags;

    if (size == null) {
      size = Rom.getSize(2 ** flags.length - 1);
    }

    const bool_item = api.item('bool', {});
    const fields = flags.map((flag, i) => {
      return {
        name: flag,
        mask: 1 << i,
        shift: i,
        item: bool_item
      };
    });

    this.#uint = api.item('uint', { size });
    this.#bitfield = api.item('bitfield', { size, fields });
    this.#states = Lookup.fromNumRecord(states || {});
  }

  static isValidArgs (args: Record<string, unknown>): args is BitmaskArgs {
    if (
      !Array.isArray(args.flags) ||
      !args.flags.every(f => typeof f === 'string')
    ) {
      throw new Error(`Expected args.flags to be an array of strings.`);
    }

    if (args.flags.length > 32) {
      throw new Error(`Bitmask cannot exceed 32 flags (found ${args.flags}).`);
    }

    if (args.size != null && !Rom.isValidSize(args.size)) {
      throw new Error(`Input size is not valid: ${args.size}`);
    }

    if (args.states != null) {
      if (typeof args.states !== 'object') {
        throw new Error(`Expected args.states to be an object map.`);
      }

      const max = args.size != null ? Rom.sizeCap(args.size) : Infinity;

      for (const [key, value] of Object.entries(args.states)) {
        const num = Number(key);
        if (!isUint(num)) {
          throw new Error(`Bitmask state keys must be uints. Found ${key}`);
        }
        if (typeof value !== 'string') {
          throw new Error(`Bitmask state values must be strings. Found ${value}`);
        }
        if (num >= max) {
          throw new Error(`State key exceeds maximum specified size`);
        }
      }
    }

    return true;
  }

  decode (rom: Rom): BitmaskData {
    const offset = rom.offset();
    const uint = this.#uint.decode(rom);

    try {
      return this.#states.by_key(uint);
    } catch {
      // Ignore missing key error
    }

    const flag_obj = rom.jsr(offset, () => {
      return this.#bitfield.decode(rom);
    });

    return this.#flags.filter(
      flag => flag_obj[flag] === true
    );
  }

  encode (value: BitmaskData, rom: Rom): void {
    if (!Array.isArray(value)) {
      const uint = this.#states.by_value(value);
      this.#uint.encode(uint, rom);
      return;
    }

    const flag_obj = Object.fromEntries(this.#flags.map(
      flag => [flag, value.includes(flag)]
    ));
    this.#bitfield.encode(flag_obj, rom);
  }

  format(data: BitmaskData): BitmaskData {
    return data;
  }

  parse(data: BitmaskData): BitmaskData {
    return data;
  }
}

type BitlistArgs = {
  item: TypeNode;
  length: number;
  bitsize: number;
  pad?: unknown;
}

class Bitlist {
  static readonly alias = 'bitlist';
  static readonly kind = 'array';

  readonly #length: number;
  readonly #bitsize: number;
  readonly #pad: unknown;
  readonly #packed_length: number;
  readonly #list: Item<'list'>;
  readonly #virtual_length: number;
  readonly #padded_length: number;

  constructor ({ item, length, bitsize, pad }: BitlistArgs, api: CompileApi) {
    this.#length = length;
    this.#bitsize = bitsize;
    this.#pad = pad;

    const total_bits = length * bitsize;
    const max_value = 2 ** bitsize - 1;
    const item_size = Rom.getSize(max_value);
    const packed_length = Math.ceil(total_bits / 8);
    const padded_length = Math.floor((packed_length * 8) / bitsize);

    this.#packed_length = packed_length;
    this.#virtual_length = Rom.sizeBytes(item_size) * padded_length;
    this.#padded_length = padded_length;
    this.#list = api.item('list', {
      length: padded_length,
      item,
    });
  }

  static isValidArgs (args: Record<string, unknown>): args is BitlistArgs {
    if (!isUint(args.length)) {
      throw new Error(`Bitlist length must be a positive number. Found ${args.length}`);
    }
    if (!isUint(args.bitsize) || args.bitsize === 0 || args.bitsize > 32) {
      throw new Error(`Bitlist bitsize must be a number between 1 and 32. Found ${args.bitsize}`);
    }
    if (!(args.item instanceof TypeNode)) {
      throw new Error('Bitlist requires an item node');
    }
    return true;
  }

  decode (rom: Rom): unknown[] {
    const raw_bytes = rom.slice(this.#packed_length);
    const virtual = unpackBits(raw_bytes, this.#bitsize);

    return rom.mount(virtual, () => {
      const padded_list = this.#list.decode(rom);
      const true_list = padded_list.splice(0, this.#length);

      for (const item of padded_list) {
        if (!deepEqualTry(item, this.#pad)) {
          throw new Error(`Unexpected pad item ${item}`);
        }
      }
      return true_list;
    });
  }

  encode (data: unknown[], rom: Rom): void {
    const items = [...data];
    const virtual = new Uint8Array(this.#virtual_length);

    while (items.length < this.#padded_length) {
      items.push(this.#pad);
    }

    rom.mount(virtual, () => {
      this.#list.encode(items, rom);
    });

    rom.set(packBits(virtual, this.#bitsize));
  }

  format (data: unknown[]): unknown[] {
    return this.#list.format(data);
  }

  parse (readable: unknown[]): unknown[] {
    return this.#list.parse(readable);
  }
}

function unpackBits (
  bytes: Uint8Array | number[],
  bitsize: number,
  item_size: number = Math.ceil(bitsize / 8)
): Uint8Array {
  const length = Math.floor((bytes.length * 8) / bitsize);
  const data = new Uint8Array(length * item_size);
  const mask = (1n << BigInt(bitsize)) - 1n;

  let buffer = 0n;
  let bits = 0;
  let byte_index = 0;

  for (let i = 0; i < length; i++) {
    // Fill the buffer with bytes until we have enough bits for the next item
    while (bits < bitsize) {
      buffer |= BigInt(bytes[byte_index++]!) << BigInt(bits);
      bits += 8;
    }

    // Write value into virtual buffer bytes (little-endian)
    const value = Number(buffer & mask);
    const offset = i * item_size;

    for (let b = 0; b < item_size; b++) {
      data[offset + b] = (value >>> (b * 8)) & 0xFF;
    }

    // Shift the buffer down
    buffer >>= BigInt(bitsize);
    bits -= bitsize;
  }

  return data;
}

function packBits (
  bytes: Uint8Array,
  bitsize: number,
  item_size: number = Math.ceil(bitsize / 8)
): Uint8Array {
  const length = Math.floor(bytes.length / item_size);
  const packed_length = Math.ceil((length * bitsize) / 8);
  const data = new Uint8Array(packed_length);
  const mask = (1n << BigInt(bitsize)) - 1n;

  let buffer = 0n;
  let bits = 0;
  let byte_index = 0;

  for (let i = 0; i < length; i++) {
    // Read value from virtual buffer bytes (little-endian)
    const offset = i * item_size;
    let value = 0;

    for (let b = 0; b < item_size; b++) {
      value |= (bytes[offset + b]! & 0xFF) << (b * 8);
    }

    // Add value to accumulator buffer
    buffer |= (BigInt(value >>> 0) & mask) << BigInt(bits);
    bits += bitsize;

    // Flush full bytes from buffer to output array
    while (bits >= 8) {
      data[byte_index++] = Number(buffer & 0xFFn);
      buffer >>= 8n;
      bits -= 8;
    }
  }

  // Flush remaining trailing bits
  if (bits > 0) {
    data[byte_index] = Number(buffer & 0xFFn);
  }

  return data;
}

type MeltedStruct = Record<string, unknown[]>;
type MeltedListArgs = {
  base?: string;
  fields: ArrayStructField[];
};

class MeltedList {
  static readonly alias = 'melted_list';
  static readonly kind = 'array';

  readonly #base: string | undefined;
  readonly #fields: readonly ArrayStructField[];
  readonly #struct: Item<'struct'>;

  constructor ({ base, fields }: MeltedListArgs, api: CompileApi) {
    this.#base = base;
    this.#fields = fields;
    this.#struct = api.item('struct', { fields });
  }

  static normalizeArgs (args: Record<string, unknown>) {
    return {
      ...args,
      fields: normalizeFields(args.fields)
    };
  }

  static isValidArgs (args: Record<string, unknown>): args is MeltedListArgs {
    if (!isValidFields(args.fields)) {
      throw new Error(`Invalid fields`);
    }
    if (args.base != null) {
      if (args.fields.every(field => field.name !== args.base)) {
        throw new Error(`MeltedList expects 'base' to be a field name. Found ${args.base}`);
      }
      if (args.fields.some(field => field.item.kind !== 'array')) {
        throw new Error(`Meltedlist fields must all decode to arrays`);
      }
    }
    return true;
  }

  #melt (list: StructData[]): MeltedStruct {
    const cloned_list = list.map(item => ({ ...item }));
    const data: MeltedStruct = {};

    if (this.#base) {
      data[this.#base] = cloned_list;
    }

    for (const field of this.#fields) {
      if (field.name !== this.#base) {
        const field_values = [];

        for (const item of cloned_list) {
          if (field.name in item) {
            field_values.push(item[field.name]);
            delete item[field.name];
          }
        }

        data[field.name] = field_values;
      }
    }

    return data;
  }

  #freeze (data: MeltedStruct): StructData[] {
    const list: StructData[] = [];

    for (const field of this.#fields) {
      const field_values = data[field.name]!;

      if (field.name === this.#base) {
        field_values.forEach((item, i) => {
          if (!list[i]) list[i] = {};
          Object.assign(list[i], item);
        });
      } else {
        field_values.forEach((value, i) => {
          if (!list[i]) list[i] = {};
          list[i][field.name] = value;
        });
      }
    }

    return list;
  }

  decode (rom: Rom): StructData[] {
    const data = this.#struct.decode(rom) as MeltedStruct;
    return this.#freeze(data);
  }

  encode (list: StructData[], rom: Rom): void {
    const data = this.#melt(list);
    this.#struct.encode(data, rom);
  }

  format (data: StructData[]): StructData[] {
    const melted = this.#melt(data);
    const formatted = this.#struct.format(melted) as MeltedStruct;
    return this.#freeze(formatted);
  }

  parse (readable: StructData[]): StructData[] {
    const melted = this.#melt(readable);
    const parsed = this.#struct.parse(melted) as MeltedStruct;
    return this.#freeze(parsed);
  }
}

export {
  List,
  SegmentList,
  Struct,
  SplitList,
  Bitfield,
  Bitmask,
  Bitlist,
  MeltedList
};

export type {
  ListModeConfig
};
