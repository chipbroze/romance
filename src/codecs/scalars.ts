import * as v from './valibot.js';
import { type Dict, type NumDict } from '../utils/types.js';
import { Lookup, hex, getKind } from './helpers.js';

import {
  type Datasize,
  CodecKit,
} from '../codec-kit.js';

declare module '../codec-kit.js' {
  interface CodecRegistry {
    empty: typeof Empty;
    static: typeof Static;
    uint: typeof Uint;
    xint: typeof HexInt;
    fixed: typeof Fixed;
    bool: typeof Bool;
    enum: typeof Enum;
    tile: typeof Tile;
  }
}

const empty_schema = v.object({});

const Empty = CodecKit.simple({
  alias: 'empty',
  kind: 'void',
  isValidArgs (args: Dict): args is Dict {
    v.assert(empty_schema, args);
    return true;
  },
  construct () {
    return {
      decode: () => {},
      encode: () => {},
      format: () => {},
      parse:  () => {}
    };
  }
});

const static_schema = v.object({
  value: v.any(),
});

const Static = CodecKit.simple({
  alias: 'static',
  kind: 'unknown',
  isValidArgs (args: Dict): args is { value: unknown } {
    v.assert(static_schema, args);
    return true;
  },
  construct ({ value }) {
    return {
      kind: getKind(value),
      decode: () => value,
      encode: () => {},
      format: () => value,
      parse:  () => value
    };
  }
});

const size_bits: Record<string, number> = {
  byte: 8,
  word: 16,
  sword: 24,
  double: 32
};
function getSizeMax (size: unknown): number {
  return 2 ** (size_bits[size as Datasize] || 0) - 1 || -1;
}

type UintArgs = {
  size: Datasize
};

const uint_schema = v.object({
  size: v.datasize(),
});

const Uint = CodecKit.simple({
  alias: 'uint',
  kind: 'number',
  isValidArgs (args: Dict): args is UintArgs {
    v.assert(uint_schema, args);
    return true;
  },
  construct (args) {
    const size = args.size;
    return {
      decode: (rom) => rom.read(size),
      encode: (uint, rom) => rom.write(uint, size),
      format: (data) => data,
      parse:  (data) => data
    };
  }
});

const UintKit = CodecKit.from<{ uint: typeof Uint }>();

const HexInt = UintKit.simple({
  alias: 'xint',
  kind: ['number', 'string'],
  isValidArgs (args: Dict): args is UintArgs {
    return Uint.isValidArgs!(args);
  },
  construct ({ size }, api) {
    const uint = api.item('uint', { size });
    return {
      decode: (rom) => uint.decode(rom),
      encode: (data, rom) => uint.encode(data, rom),
      format: (data) => hex(data, size).toString(),
      parse:  (data) => +hex(+data, size)
    };
  }
});

type FixedArgs = {
  size: Datasize;
  value: number;
  hide?: boolean;
};

const fixed_schema = v.object({
  size: v.datasize(),
  value: v.uint(),
  hide: v.optional(v.boolean()),
});

const Fixed = UintKit.simple({
  alias: 'fixed',
  kind: 'number',
  isValidArgs (args: Dict): args is FixedArgs {
    v.assert(fixed_schema, args);
    if (args.value > getSizeMax(args.size)) {
      throw new Error(`Fixed value (${args.value}) exceeds max for size: ${args.size}`);
    }
    return true;
  },
  construct ({ value, size, hide }, api) {
    const uint = api.item('uint', { size });

    const validate = (data: number) => {
      if (value == null ? data != null : data !== value) {
        throw new Error(`Fixed type expected ${value}, found ${data}`);
      }
      return data;
    }

    return {
      decode: (rom) => validate(uint.decode(rom)),
      encode: (data, rom) => uint.encode(validate(data), rom),
      format: (data) => hide ? null : uint.format(data),
      parse: (data) => hide ? value : uint.parse(data!)
    };
  }
});

type BoolArgs = { size?: Datasize };

const bool_schema = v.object({
  size: v.optional(v.datasize()),
});

const Bool = UintKit.simple({
  alias: 'bool',
  kind: 'boolean',
  isValidArgs (args: Dict): args is BoolArgs {
    v.assert(bool_schema, args);
    return true;
  },
  construct (args: BoolArgs, api) {
    const size = args.size ?? 'byte';
    const $uint = api.item('uint', { size });

    return {
      decode: (rom) => {
        const uint = $uint.decode(rom);
        switch (uint) {
          case 0: return false;
          case 1: return true;
          default: {
            throw new Error(`Bool type expects uint 0x0 or 0x1, found ${uint}`);
          }
        }
      },
      encode: (bool, rom) => {
        if (Boolean(bool) !== bool) {
          throw new Error(`Boolean expected, found ${bool}`);
        }
        return $uint.encode(Number(bool), rom);
      },
      format: (bool) => bool,
      parse: (bool) => bool
    };
  }
});

type EnumArgs = {
  size?: Datasize;
  values: NumDict<string>;
};

const enum_schema = v.object({
  size: v.optional(v.datasize()),
  values: v.num_dict(v.string())
});

const Enum = UintKit.simple({
  alias: 'enum',
  kind: 'string',
  // Normalize array values into object with index keys
  normalizeArgs (args) {
    const { values: raw_values, ...rest } = args;
    const values = (Array.isArray(raw_values)
      ? { ...raw_values }
      : raw_values
    );
    return { values, ...rest };
  },
  isValidArgs (args: Dict): args is EnumArgs {
    v.assert(enum_schema, args);
    const { values, size } = args;
    const keys = Object.keys(values).map(Number);
    const max_key = Math.max(...keys);

    if (max_key > getSizeMax(size || 'byte')) {
      throw new Error(`Found uint size exceeding max: ${max_key} > ${size}`);
    }
    if (!size && keys.some(k => k > 0xFF)) {
      throw new Error('Must specify size if enum keys > 0xFF');
    }
    return true;
  },
  construct ({ values, size='byte' }, api) {
    const $uint = api.item('uint', { size });
    const $lookup = Lookup.fromNumRecord(values);

    return {
      decode: (rom) => $lookup.byKey($uint.decode(rom)),
      encode: (str, rom) => $uint.encode($lookup.byValue(str), rom),
      format: (data) => data,
      parse: (data) => data
    };
  }
});

type TileArgs = {
 bpp: 1 | 2 | 4 
};

const tile_schema = v.object({
  bpp: v.picklist([1, 2, 4]),
});

// TODO: Reduce use of `!` for potentially undefined variables
const Tile = CodecKit.simple({
  alias: 'tile',
  kind: ['array', 'string'],
  isValidArgs (args: Dict): args is TileArgs {
    v.assert(tile_schema, args);
    return true;
  },
  construct ({ bpp }) {
    return {
      decode: (rom) => {
        const data: number[] = new Array(64).fill(0x00);
        const bitplanes = []

        for (let i = 0; i < bpp; i += 2) {
          const plane_a = [];
          const plane_b = i + 1 === bpp ? null : ([] as number[]);

          for (let j = 0; j < 8; j++) {
            plane_a.push(rom.read('byte'));
            if (plane_b) plane_b.push(rom.read('byte'));
          }

          bitplanes.push(plane_a);
          if (plane_b) bitplanes.push(plane_b);
        }

        for (let i = 0, mask = 0x01; i < bpp; i++, mask <<= 1) {
          const bitplane = bitplanes[i];

          for (let j = 0; j < bitplane!.length; j++) {
            const row = bitplane![j];

            for (let k = 0, bit = 0x01; k < 8; k++, bit <<= 1) {
              if (row! & bit) {
                const index = j * 8 + (7 - k);
                data[index]! |= mask;
              }
            }
          }
        }

        return data;
      },
      encode: (data, rom) => {
        const bitplanes = [];

        for (let i = 0, mask = 0x01; i < bpp; i++, mask <<= 1) {
          const bitplane = []; 

          for (let j = 0; j < data.length; j += 8) {
            let row_byte = 0x00;

            for (let k = 0; k < 8; k++) {
              const pixel = data[j + k];
              const bit = pixel! & mask ? 1 : 0;
              row_byte = (row_byte << 1) | bit;
            }

            bitplane.push(row_byte);
          }

          bitplanes.push(bitplane);
        }

        for (let i = 0; i < bpp; i += 2) {
          const plane_a = bitplanes[i];
          const plane_b = bitplanes[i + 1];

          for (let j = 0; j < 8; j++) {
            rom.write(plane_a![j]!, 'byte');
            if (plane_b) rom.write(plane_b![j]!, 'byte');
          }
        }
      },
      format: (list) => {
        return Array(8).fill(undefined).map((_, i) => {
          return list.slice(i * 8, i * 8 + 8).map(n => n.toString(16)).join('');
        }).join('\n');
      },
      parse: (data) => {
        return data.split('\n').map(line => {
          return line.split('').map(x => parseInt(x, 16));
        }).flat();
      }
    };
  }
});

export {
  Empty,
  Static,
  Uint,
  HexInt,
  Fixed,
  Bool,
  Enum,
  Tile
};

