import { Lookup, hex, type Dict } from './utils.js';
import { Rom, type datasize } from '../rom.js';
import {
  CodecKit,
} from '../type-registry.js';

declare module '../type-registry.js' {
  interface MasterTypeRegistry {
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

const Empty = CodecKit.simple({
  alias: 'empty',
  kind: 'void',
  construct () {
    return {
      decode: () => {},
      encode: () => {},
      format: () => {},
      parse:  () => {}
    };
  }
});

const Static = CodecKit.simple({
  alias: 'static',
  kind: 'unknown',
  construct ({ value }) {
    return {
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
  return 2 ** (size_bits[size as datasize] || 0) - 1 || -1;
}

type UintArgs = {
  size: datasize
};

const Uint = CodecKit.simple({
  alias: 'uint',
  kind: 'number',
  isValidArgs (args: Dict): args is UintArgs {
    if (!Rom.isValidSize(args.size)) {
      throw new Error(`Input.size is not valid: ${args.size}`);
    }
    return true;
  },
  construct (args) {
    const size = args.size ?? 'byte';
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
  kind: 'number',
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
  size: datasize;
  value: number;
  hide?: boolean;
};

const Fixed = UintKit.simple({
  alias: 'fixed',
  kind: 'number',
  isValidArgs (args: Dict): args is FixedArgs {
    if (typeof args.hide === 'object') {
      throw new Error(`Expected boolean or undefined for "hide". Found ${args.hide}`);
    }
    if (typeof args.value !== 'number' || !Number.isInteger(args.value) || args.value < 0) {
      throw new Error(`Expected uint for "value". Found ${args.value}`);
    }
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

const Bool = UintKit.simple({
  alias: 'bool',
  kind: 'boolean',
  construct (args: { size?: datasize }, api) {
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

const Enum = UintKit.simple({
  alias: 'enum',
  kind: 'string',
  isValidArgs (args: Record<string, unknown>): args is ({
    size?: datasize;
    values: string[] | Record<number, string>;
  }) {
    const { values } = args;
    if (values == null || typeof values !== 'object') {
      throw new Error(`Expected array or object for "values". Found: ${values}`);
    }
    if (maxKey() > getSizeMax(args.size)) {
      throw new Error(`Found uint size exceeding max: ${maxKey()}`);
    }
    function maxKey () {
      if (Array.isArray(values)) {
        return values.length - 1;
      } else {
        return Math.max(
          ...Object.keys(values as Record<string, unknown>).map(Number)
        );
      }
    }
    if (!args.size && Object.keys(values).some(k => parseInt(k) > 0xFF)) {
      throw new Error('Must specify size if enum keys > 0xFF');
    }

    return true;
  },
  construct ({ values, size='byte' }, api) {
    const $uint = api.item('uint', { size });
    const lookup = (Array.isArray(values)
      ? Lookup.fromArray(values)
      : Lookup.fromNumRecord(values)
    );

    return {
      decode: (rom) => lookup.by_key($uint.decode(rom)),
      encode: (str, rom) => $uint.encode(lookup.by_value(str), rom),
      format: (data) => data,
      parse: (data) => data
    };
  }
});

// TODO: Reduce use of `!` for potentially undefined variables
const Tile = CodecKit.simple({
  alias: 'tile',
  kind: 'array',
  construct ({ bpp }: { bpp: 2 | 4 }) {
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

