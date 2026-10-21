import * as v from './valibot.js';
import { Lookup } from './helpers.js';
import { deepEqualTry } from '../utils/assert.js';
import { type Dict } from '../utils/types.js';
import { Rom } from '../core/rom.js';

import {
  CodecKit,
  type CodecNode,
  type RuntimeApi,
  type Datasize
} from '../codec-kit.js';

import type { Uint, Bool } from './scalars.js';
import type { Custom, Range } from './ops.js';

declare module '../codec-kit.js' {
  interface CodecRegistry {
    list: typeof List;
    struct: typeof Struct;
    segment_list: typeof SegmentList;
    split_list: typeof SplitList;
    bitfield: typeof Bitfield;
    bitmask: typeof Bitmask;
    bitlist: typeof Bitlist;
    melted_list: typeof MeltedList;
  }

  interface CodecRules <Args=Dict> {
    fields: (Args extends { readonly fields: infer Fs extends FieldTuple } ? [
      {[F in Fs[number] as F['name']]: F['item']['<Data>'];},
      {[F in Fs[number] as F['name']]: F['item']['<Formatted>'];}
    ] : never);

    list_list: (Args extends { item: infer I extends CodecNode }
      ? [I['<Data>'][][], I['<Formatted>'][][]]
      : never
    );

    split_list: (Args extends { readonly fields: infer Fs extends FieldTuple } ? [
      SplitDataOf<Fs>[],
      SplitFormattedOf<Fs>[]
    ] : never);

    melted_list: (Args extends {readonly fields: infer Fs extends FieldTuple } ? [
      {[F in Fs[number] as F['name']]: ArrayItem<F['item']['<Data>']>;}[],
      {[F in Fs[number] as F['name']]: ArrayItem<F['item']['<Formatted>']>;}[],
    ] : never);
  }
}

type ArrayItem <T> = (
  T extends readonly (infer Item)[] ? Item : never
);

type ListMode <T> = {
  inclusive: boolean;
  until: (rom: Rom) => boolean;
  ended: (next: T, list: T[], rom: Rom) => boolean;
  final: (list: T[]) => T[];
  error: (list: T[]) => string | null;
};

type ListModeArgs <T> = {
  length: number;
  eol: T;
  until: (rom: Rom) => boolean;
};

const list_modes = {
  length: <T> (length: ListModeArgs<T>['length']): ListMode<T> => ({
    inclusive: true,
    until: () => false,
    ended: (_next, list) => list.length === length - 1,
    final: (list) => list,
    error: (list) => (list.length === length ? null
      : list.length < length ? `List is shorter than specified length of ${length}`
      : list.length > length ? `List exceeds specified length of ${length}`
      : null
    )
  }),
  eol: <T> (arg: ListModeArgs<T>['eol']): ListMode<T> => ({
    inclusive: false,
    until: () => false,
    ended: (next) => deepEqualTry(next, arg),
    final: (list: T[]) => list.concat(arg),
    error: () => null
  }),
  until: <T> (
    until: ListModeArgs<T>['until']
  ): ListMode<T> => ({
    inclusive: false,
    until: (rom) => rom.atEnd() || rom.peek(() => until(rom)),
    ended: () => false,
    final: (list) => list,
    error: () => null
  })
};

// NOTE: This switch statement is necessary to disambiguate the mode union
function resolveListMode <T> (mode: ListModeSpec<T>): ListMode<T> {
  switch (mode.key) {
    case 'length': return list_modes.length(mode.arg);
    case 'eol': return list_modes.eol(mode.arg);
    case 'until': return list_modes.until(mode.arg);
  }
}

type ListModeSpec <Data> = {
  [Mode in keyof ListModeArgs<Data>]: {
    key: Mode;
    arg: ListModeArgs<Data>[Mode];
  };
}[keyof ListModeArgs<Data>];

type ListArgs <
  Item extends CodecNode = CodecNode
> = {
  item: Item;
  mode: ListModeSpec<Item['<Data>']>;
};

const list_mode_schema = v.union([
  v.object({
    key: v.literal('length'),
    arg: v.uint()
  }),
  v.object({
    key: v.literal('eol'),
    arg: v.any()
  }),
  v.object({
    key: v.literal('until'),
    arg: v.function()
  })
]);

const list_schema = v.object({
  item: v.node(),
  mode: list_mode_schema
});

const List = CodecKit.composite({
  alias: 'list',
  kind: 'array',
  rule: 'list',
  /**
   * Support mode specification shorthand:
   * { length: 3 } -> { mode: { key: 'length', arg: 3 }}
   * { eol: '<end>' } -> { mode: { key: 'eol', arg: '<end>' }}
   */
  normalizeArgs (args) {
    const { item, mode, ...rest } = args;
    let new_mode = mode;
    if (!new_mode) {
      const [key, arg] = Object.entries(rest)[0] || [];
      new_mode = { key, arg };
    }
    return { mode: new_mode, item };
  },
  isValidArgs (args: Dict): args is ListArgs {
    v.assert(list_schema, args);
    if (args.mode.key === 'length' && args.mode.arg < 1) {
      throw new Error(`Expected length to be positive integer`);
    }
    return true;
  },
  construct: <Item extends CodecNode> (
    { item, mode }: ListArgs<Item>
  ) => {
    type ItemData = Item['<Data>'];
    type ItemFormatted = Item['<Formatted>'];

    const $item = item as CodecNode<ItemData, ItemFormatted>;
    const meta = resolveListMode<ItemData>(mode);
    const trace = (i: number, api: RuntimeApi) => {
      api.trace('list_index', i.toString());
    }

    return CodecKit.instance<ItemData[], ItemFormatted[]>({ 
      decode: (rom, api) => {
        const list = [];

        for (let has_ended = false; !has_ended && !meta.until(rom);) {
          trace(list.length, api);
          const next = $item.decode(rom);
          has_ended = meta.ended(next, list, rom);
          if (!has_ended || meta.inclusive) {
            list.push(next);
          }
        }
        return list;
      },
      encode: (raw_list, rom, api) => {
        const list = meta.final(raw_list);
        const error = meta.error(list);

        if (error) {
          throw new Error(error);
        }

        list.forEach((value, i) => {
          trace(i, api);
          $item.encode(value, rom);
        });
      },
      format: (data, api) => {
        return data.map((item, i) => {
          trace(i, api);
          return $item.format(item);
        });
      },
      parse: (data, api) => {
        return data.map((item, i) => {
          trace(i, api);
          return $item.parse(item);
        });
      }
    });
  }
});

type StructField <N extends string = string> = {
  readonly name: N;
  readonly item: CodecNode;
};
type FieldTuple = readonly StructField[];
type StructArgs <
  Fields extends FieldTuple = FieldTuple
> = {
  readonly fields: Fields;
};
type FieldsData <Fields extends FieldTuple> = {
  [F in Fields[number] as F['name']]: F['item']['<Data>']
};
type FieldsFormatted <Fields extends FieldTuple> = {
  [F in Fields[number] as F['name']]: F['item']['<Formatted>']
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

const fields_schema = v.array(
  v.object({
    name: v.string(),
    item: v.node()
  })
);

const struct_schema = v.object({
  fields: fields_schema
});

const Struct = CodecKit.composite({
  alias: 'struct',
  kind: 'object',
  rule: 'fields',
  normalizeArgs (args: Dict) {
    return {
      ...args,
      fields: normalizeFields(args.fields)
    };
  },
  isValidArgs (args: Dict): args is StructArgs {
    v.assert(struct_schema, args);
    return true;
  },
  construct <
    const Fields extends FieldTuple
  > ({ fields }: StructArgs<Fields>) {
    type StructData = FieldsData<Fields>;
    type StructFormatted = FieldsFormatted<Fields>;

    const eachField = <R> (api: RuntimeApi, fn: (field: Fields[number]) => R) => {
      for (const field of fields) {
        api.trace('struct_field', field.name);
        fn(field);
      }
    };

    return CodecKit.instance<StructData, StructFormatted>({
      decode: (rom, api) => {
        const data = {} as StructData;

        eachField(api, field => {
          data[field.name as keyof StructData] = (
            field.item.decode(rom) as StructData[keyof StructData]
          );
        });

        return data;
      },
      encode: (data, rom, api) => {
        eachField(api, field => {
          field.item.encode(data[field.name as keyof StructData], rom);
        });
      },
      format: (data, api) => {
        const formatted = {} as StructFormatted;

        eachField(api, field => {
          formatted[field.name as keyof StructFormatted] = (
            field.item.format(
              data[field.name as keyof StructData]
            ) as StructFormatted[keyof StructFormatted]
          );
        });

        return formatted;
      },
      parse: (data, api) => {
        const parsed = {} as StructData;

        eachField(api, field => {
          parsed[field.name as keyof StructData] = (
            field.item.parse(
              data[field.name as keyof StructFormatted]
            ) as StructData[keyof StructData]
          );
        });

        return parsed;
      }
    });
  }
});

type SegmentListArgs <Item extends CodecNode = CodecNode> = {
  item: Item;
  length: number;
  org: number;
  base: number;
  warn?: number;
  size?: Datasize
};

const segment_list_schema = v.object({
  item: v.node(),
  length: v.uint(),
  org: v.uint(),
  warn: v.nullish(v.uint()),
  base: v.optional(v.uint()),
  size: v.optional(v.datasize()),
});

const SegmentList = CodecKit.from<{
  uint: typeof Uint,
  list: typeof List,
  custom: typeof Custom,
  range: typeof Range
}>().run(Kit => Kit.composite({
  alias: 'segment_list',
  kind: 'array',
  rule: 'list_list',
  isValidArgs (args: Dict): args is SegmentListArgs {
    v.assert(segment_list_schema, args);
    return true;
  },
  construct <Item extends CodecNode> (
    { item, length, org, base, warn, size }: SegmentListArgs<Item>,
    api: typeof Kit.Api
  ) {
    type ItemData = Item['<Data>'];
    type ItemFormatted = Item['<Formatted>'];
    const $item = item as CodecNode<ItemData, ItemFormatted>;
    const $warn = warn == null ? {} : { warn };

    size ??= 'word';
    base ??= org;

    const $pointer_list = api.item('list', {
      item: api.item('uint', { size }),
      mode: { key: 'length', arg: length + 1 }
    });

    return Kit.instance<ItemData[][], ItemFormatted[][]>({
      decode: (rom, api) => {
        const eols = $pointer_list.decode(rom).map(p => p + base);
        let eol_index = 1;

        const $sublist = api.item('list', {
          item: $item,
          mode: {
            key: 'until',
            arg: (rom: Rom) => {
              if (rom.offset() === eols[eol_index]) {
                eol_index++;
                return true; 
              }
              return false;
            }
          }
        });

        const $list = api.item('range', {
          org,
          ...$warn,
          item: api.item('list', {
            item: $sublist,
            mode: { key: 'length', arg: length }
          })
        });

        return $list.decode(rom);
      },
      encode: (sublists, rom, api) => {
        const eols = [org];
        const sublist = api.item('list', {
          item: $item,
          mode: {
            key: 'until',
            arg: () => true
          }
        });
        const list = api.item('range', {
          org,
          ...$warn,
          item: api.item('list', {
            mode: { key: 'length', arg: length },
            item: api.item('custom', {
              args: {},
              construct: () => ({
                encode: (data: ItemData[], rom: Rom) => {
                  sublist.encode(data, rom);
                  eols.push(rom.offset());
                }
              })
            })
          })
        });

        list.encode(sublists, rom);
        const pointers = eols.map(eol => eol - base);
        return $pointer_list.encode(pointers, rom);
      },
      parse: (array) => {
        return array.map(item => {
          return item.map(subitem => $item.parse(subitem));
        });
      },
      format: (list) => {
        return list.map(item => {
          return item.map(subitem => $item.format(subitem));
        });
      }
    });
  }
}));

type BitfieldField <N extends string = string> = StructField<N> & {
  readonly mask: number;
  readonly shift?: number | null;
  readonly size?: Datasize | null;
};
type BitfieldTuple = readonly BitfieldField[];
type BitfieldArgs <
  Fields extends BitfieldTuple = BitfieldTuple
> = {
  size?: Datasize;
  readonly fields: Fields
};

const bitfield_schema = v.object({
  size: v.optional(v.datasize()),
  fields: v.array(
    v.object({
      name: v.string(),
      item: v.node(),
      mask: v.uint(),
      shift: v.optional(v.uint()),
      size: v.optional(v.datasize()),
    })
  ),
});

const Bitfield = CodecKit.from<{
  uint: typeof Uint,
  struct: typeof Struct
}>().run(Kit => Kit.composite({
  alias: 'bitfield',
  kind: 'object',
  rule: 'fields',
  normalizeArgs (args: Dict) {
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
  },
  isValidArgs (args: Dict): args is BitfieldArgs {
    v.assert(bitfield_schema, args);

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
      if (total_bits >= 2 ** (8 * Rom.sizeBytes(args.size))) {
        throw new Error(`Specified size (${args.size}) cannot accommodate masks`);
      }
    }

    return true;
  },
  construct <
    const Fields extends BitfieldTuple
  > (
    { size, fields }: BitfieldArgs<Fields>,
    api: typeof Kit.Api
  ) {
    type BitfieldData = FieldsData<Fields>;
    type BitfieldFormatted = FieldsFormatted<Fields>;

    const $struct = api.item('struct', { fields });
    const $uint = api.item('uint', {
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
    const length = masks.reduce((length, mask) => {
      return length + Rom.sizeBytes(mask.size);
    }, 0);

    return Kit.instance<BitfieldData, BitfieldFormatted>({
      decode: (rom) => {
        const bitfield = $uint.decode(rom);

        return rom.mount(new Uint8Array(length), () => {
          // First, write the field values to the virtual rom address
          rom.peek(() => {
            for (const { mask, shift, uint } of masks) {
              const bits = bitfield & mask;
              const value = bits >>> shift;
              uint.encode(value, rom);
            }
          });
          // Then, read the values back with the full nodes
          return $struct.decode(rom);
        });
      },
      encode: (data, rom) => {
        let bitfield = 0;

        rom.mount(new Uint8Array(length), () => {
          rom.peek(() => {
            $struct.encode(data, rom);
          });

          for (const { mask, shift, uint } of masks) {
            const value = uint.decode(rom);
            const shifted = ((value << shift) & mask) >>> 0;
            bitfield = (bitfield | shifted) >>> 0;
          }
        });

        $uint.encode(bitfield, rom);
      },
      format: (data) => {
        return $struct.format(data);
      },
      parse: (readable) => {
        return $struct.parse(readable);
      }
    });
  }
}));

type StructOfArrays <S extends CodecNode> = CodecNode<
  S['<Data>'] & Dict<unknown[]>,
  S['<Formatted>'] & Dict<unknown[]>
>;

type ValidArrayFields <Fields extends FieldTuple> = {
  [I in keyof Fields]: [
    Fields[I]['item']['<Data>'],
    Fields[I]['item']['<Formatted>'],
    Fields[I]['item']['kind']
  ] extends [
    readonly unknown[],
    readonly unknown[],
    'array'
  ] ? never : I
}[keyof Fields] extends never ? Fields : never;

type SplitArgs <
  Fields extends FieldTuple = FieldTuple
> = {
  id: string,
  readonly fields: ValidArrayFields<Fields>
};

type SplitFormattedOf <Fields extends FieldTuple> = (
  Fields[number]['item']['<Formatted>']
);
type SplitDataOf <Fields extends FieldTuple> = {
  [I in keyof Fields & number]: {
    field: Fields[I]['name'];
    value: Fields[I]['item']['<Data>'];
  }
}[number];

const split_list_schema = v.object({
  id: v.string(),
  fields: fields_schema,
});

const SplitList = CodecKit.from<{
  struct: typeof Struct
}>().run(Kit => Kit.composite({
  alias: 'split_list',
  kind: 'array',
  rule: 'split_list',
  normalizeArgs (args: Dict) {
    return {
      ...args,
      fields: normalizeFields(args.fields)
    };
  },
  isValidArgs (args: Dict): args is SplitArgs {
    v.assert(split_list_schema, args);
    assertArrayFields(args.fields);
    return true;
  },
  construct <
    Fields extends FieldTuple
  > (
    { id, fields }: SplitArgs<Fields>,
    api: typeof Kit.Api
  ) {
    const $id = id;
    const _struct = api.item('struct', { fields });
    type StructNode = StructOfArrays<typeof _struct>;
    type StructData = StructNode['<Data>'];
    type StructFormatted = StructNode['<Formatted>'];
    type SplitData = SplitDataOf<Fields>;
    const $struct = _struct as StructNode;
    const $order = fields.map(field => field.name) as Fields[number]['name'][];

    const $split = (list: SplitData[]) => {
      const obj = Object.fromEntries(
        $order.map(field => [field, [] as unknown[]])
      ) as StructData;
      list.forEach(item => {
        obj[item.field].push(item.value);
      });
      return obj;
    };

    const $join = (obj: StructData): SplitData[] => {
      return $order.flatMap(field => {
        return (obj[field]).map(value => ({ field, value }));
      }) as SplitData[];
    };

    return Kit.instance<SplitData[], SplitFormattedOf<Fields>[]>({
      decode: (rom) => {
        const obj = $struct.decode(rom);
        return $join(obj);
      },
      encode: (list, rom) => {
        const obj = $split(list);
        return $struct.encode(obj, rom);
      },
      format: (list, api) => {
        const obj = $split(list);
        const data = $struct.format(obj);
        const lists = $order.map(name => data[name]);
        api.setLib!($id, lists.map(l => l.length));
        return lists.flat();
      },
      parse: (list, api) => {
        const clone = list.slice();
        const lengths = api.getLib!($id) as number[];
        const obj = lengths.reduce((obj, length, i) => {
          const name = $order[i]!;
          obj[name] = clone.splice(0, length) as StructFormatted[typeof name];
          return obj;
        }, {} as StructFormatted);

        return $join($struct.parse(obj));
      }
    });
  }
}));

type BitmaskArgs = {
  readonly flags: readonly string[];
  readonly states?: Record<number, string>;
  readonly size?: Datasize;
};

const bitmask_schema = v.object({
  flags: v.array(v.string()),
  states: v.optional(v.num_dict(v.string())),
  size: v.optional(v.datasize()),
});

const Bitmask = CodecKit.from<{
  uint: typeof Uint,
  bool: typeof Bool,
  bitfield: typeof Bitfield
}>().run(Kit => Kit.simple({
  alias: 'bitmask',
  kind: 'unknown',
  isValidArgs (args: Dict): args is BitmaskArgs {
    v.assert(bitmask_schema, args);

    if (args.flags.length > 32) {
      throw new Error(`Bitmask cannot exceed 32 flags (found ${args.flags.length}).`);
    }

    if (args.states != null) {
      const max = args.size != null ? Rom.sizeCap(args.size) : Infinity;

      for (const key of Object.keys(args.states)) {
        if (Number(key) >= max) {
          throw new Error(`State key exceeds maximum specified size`);
        }
      }
    }

    return true;
  },
  construct ({ size: _size, flags, states }: BitmaskArgs, api) {
    const $flags = flags;
    const size = _size ?? Rom.getSize(2 ** flags.length - 1);
    const bool_item = api.item('bool', {});
    const fields = flags.map((flag, i) => {
      return {
        name: flag,
        mask: 1 << i >>> 0,
        shift: i,
        item: bool_item
      };
    });

    const $uint = api.item('uint', { size });
    const $bitfield = api.item('bitfield', { size, fields });
    const $states = Lookup.fromNumRecord(states || {});

    return {
      decode: (rom) => {
        const offset = rom.offset();
        const uint = $uint.decode(rom);

        if ($states.hasKey(uint)) {
          return $states.byKey(uint);
        }

        const flag_obj = rom.jsr(offset, () => {
          return $bitfield.decode(rom);
        });

        return $flags.filter(
          flag => flag_obj[flag] === true
        );
      },
      encode: (value, rom) => {
        if (!Array.isArray(value)) {
          const uint = $states.byValue(value);
          $uint.encode(uint, rom);
          return;
        }

        const flag_obj = Object.fromEntries($flags.map(
          flag => [flag, value.includes(flag)]
        ));
        $bitfield.encode(flag_obj, rom);
      },
      format: (data) => {
        return data;
      },
      parse: (data) => {
        return data;
      }
    };
  }
}));

type BitlistArgs <Item extends CodecNode = CodecNode> = {
  item: Item;
  length: number;
  bitsize: number;
  pad?: Item['<Data>'];
}

const bitlist_schema = v.object({
  item: v.node(),
  length: v.uint(),
  bitsize: v.uint(),
  pad: v.optional(v.any()),
});

const Bitlist = CodecKit.from<{
  list: typeof List
}>().run(Kit => Kit.composite({
  alias: 'bitlist',
  kind: 'array',
  rule: 'item',
  isValidArgs (args: Dict): args is BitlistArgs {
    v.assert(bitlist_schema, args);

    if (args.bitsize === 0 || args.bitsize > 32) {
      throw new Error(`Bitlist bitsize must be a number between 1 and 32. Found ${args.bitsize}`);
    }
    return true;
  },
  construct <Item extends CodecNode> (
    { item, length, bitsize, pad }: BitlistArgs<Item>,
    api: typeof Kit.Api
  ) {
    const $length = length;
    const $bitsize = bitsize;
    const $pad = pad;

    const total_bits = length * bitsize;
    const max_value = 2 ** bitsize - 1;
    const item_size = Rom.getSize(max_value);
    const packed_length = Math.ceil(total_bits / 8);
    const padded_length = Math.floor((packed_length * 8) / bitsize);

    const $packed_length = packed_length;
    const $virtual_length = Rom.sizeBytes(item_size) * padded_length;
    const $padded_length = padded_length;
    const $list = api.item('list', {
      mode: { key: 'length', arg: padded_length },
      item,
    });

    return Kit.instance<Item['<Data>'][], Item['<Formatted>'][]>({
      decode: (rom) => {
        const raw_bytes = rom.subarray($packed_length);
        const virtual = unpackBits(raw_bytes, $bitsize);

        return rom.mount(virtual, () => {
          const padded_list = $list.decode(rom);
          const true_list = padded_list.splice(0, $length);

          for (const item of padded_list) {
            if (!deepEqualTry(item, $pad)) {
              throw new Error(`Unexpected pad item ${item}`);
            }
          }
          return true_list;
        });
      },
      encode: (data, rom) => {
        const items = [...data];
        const virtual = new Uint8Array($virtual_length);

        while (items.length < $padded_length) {
          items.push($pad);
        }

        rom.mount(virtual, () => {
          $list.encode(items, rom);
        });

        rom.set(packBits(virtual, $bitsize));
      },
      format: (data) => {
        return $list.format(data);
      },
      parse: (readable) => {
        return $list.parse(readable);
      }
    });
  }
}));

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

type MeltedListArgs <
  Fields extends FieldTuple = FieldTuple
> = {
  fields: ValidArrayFields<Fields>
};

function assertArrayFields (fields: FieldTuple): void {
  for (const field of fields) {
    if (field.item.kind.some(k => k !== 'array')) {
      throw new Error(`Field ${field.name} does not decode to array`);
    }
  }
}

function isSparse (arr: unknown[]): boolean {
  let seen_val = false;
  let seen_undef = false;
  for (const x of arr) {
    if (x === undefined) {
      if (seen_val) {
        seen_undef = true;
      }
    } else {
      if (seen_undef) {
        return true;
      }
      seen_val = true;
    }
  }
  return false;
}

const MeltedList = CodecKit.from<{
  struct: typeof Struct
}>().run(Kit => Kit.composite({
  alias: 'melted_list',
  kind: 'array',
  rule: 'melted_list',
  normalizeArgs (args: Dict) {
    return {
      ...args,
      fields: normalizeFields(args.fields)
    };
  },
  isValidArgs (args: Dict): args is MeltedListArgs {
    v.assert(struct_schema, args);
    assertArrayFields(args.fields);
    return true;
  },
  construct <
    Fields extends FieldTuple
  > (
    { fields }: MeltedListArgs<Fields>,
    api: typeof Kit.Api
  ) {
    const $fields = fields;
    const _struct = api.item('struct', { fields });
    type StructNode = StructOfArrays<typeof _struct>;
    type StructData = StructNode['<Data>'];
    type StructFormatted = StructNode['<Formatted>'];
    const $struct = _struct as StructNode;

    type Melted <StructType extends StructData | StructFormatted> = {
      [K in keyof StructType]: ArrayItem<StructType[K]>;
    }[];

    const $melt = <
      StructType extends StructData | StructFormatted
    > (list: Melted<StructType>) => {
      return Object.fromEntries($fields.map(field => {
        const field_values = list.map(item => item[field.name]);
        if (isSparse(field_values)) {
          throw new Error(`Melted list arrays cannot be sparse`);
        }
        return [field.name, field_values.filter(x => x !== undefined)];
      })) as StructType;
    };

    const $freeze = <
      StructType extends StructData | StructFormatted
    > (data: StructType) => {
      const lengths = $fields.map(field => data[field.name]!.length);
      const length = Math.max(...lengths);

      return Array.from({ length }, (_, i) => {
        return Object.fromEntries($fields.flatMap(field => {
          const field_data = data[field.name]!;
          return field_data.length > i ? [[
            field.name,
            data[field.name]![i]
          ]] : [];
        }));
      }) as Melted<StructType>;
    };

    return Kit.instance<Melted<StructData>, Melted<StructFormatted>>({
      decode: (rom) => {
        const data = $struct.decode(rom);
        return $freeze(data);
      },
      encode: (list, rom) => {
        const data = $melt(list);
        $struct.encode(data, rom);
      },
      format: (data) => {
        const melted = $melt(data);
        const formatted = $struct.format(melted);
        return $freeze(formatted);
      },
      parse: (readable) => {
        const melted = $melt(readable);
        const parsed = $struct.parse(melted);
        return $freeze(parsed);
      }
    });
  }
}));

export {
  List,
  Struct,
  SegmentList,
  SplitList,
  Bitfield,
  Bitmask,
  Bitlist,
  MeltedList,

  list_mode_schema
};

export type {
  ListModeSpec
};
