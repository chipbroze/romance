import {
  AbstractPassthrough,
  Lookup,
  hex
} from './utils.js';

import type {
  Item,
  datasize,
  CompileApi,
} from '../type-registry.js';

import {
  Rom,
  satisfiesRomance
} from '../type-registry.js';

// Types

class Empty {
  static readonly alias = 'empty';
  static readonly kind = 'void';
  decode () {}
  encode () {}
  format () {}
  parse () {}
}

satisfiesRomance(Empty);

class Static {
  static readonly alias = 'static';
  #value: unknown;

  constructor ({ value }: { value: unknown }) {
    this.#value = value;
  }
  decode () { return this.#value; }
  encode () {}
  format () { return this.#value; }
  parse () { return this.#value; }
}

const size_bits: Record<string, number> = { byte: 8, word: 16, sword: 24, double: 32 };
function getSizeMax (size: unknown): number {
  return 2 ** (size_bits[size as datasize] || 0) - 1 || -1;
}

type UintArgs = {
  size: datasize
};

class Uint {
  static readonly alias = 'uint';
  static readonly kind = 'number';
  #size: UintArgs['size'];

  constructor ({ size='byte' }: UintArgs) {
    this.#size = size;
  }
  static isValidArgs (args: Record<string, unknown>): args is UintArgs {
    if (!Rom.isValidSize(args.size)) {
      throw new Error(`Input.size is not valid: ${args.size}`);
    }
    return true;
  }
  decode (rom: Rom) {
    return rom.read(this.#size);
  }
  encode (uint: number, rom: Rom) {
    return rom.write(uint, this.#size);
  }
  format (data: number) { return data; }
  parse (data: number) { return data; }
}

class HexInt extends AbstractPassthrough<Item<'uint'>, number, string> {
  static readonly alias = 'xint';
  #size: UintArgs['size'];

  constructor ({ size }: UintArgs, api: CompileApi) {
    super({
      item: api.item('uint', { size })
    });
    this.#size = size;
  }
  override format (uint: number): string {
    return hex(uint, this.#size).toString();
  }
  override parse (data: string): number {
    return +hex(+data, this.#size);
  }
}

type FixedArgs = UintArgs & {
  hide?: boolean,
  value: number
};

class Fixed {
  static readonly alias = 'fixed';
  #uint: Item<'uint'>;
  #hide?: FixedArgs['hide'];
  #fixed: FixedArgs['value'];

  constructor ({ value, size, hide }: FixedArgs, api: CompileApi) {
    this.#uint = api.item('uint', { size });
    this.#hide = hide;
    this.#fixed = value;
  }
  #validate (value: number): number {
    if (this.#fixed == null ? value != null : value !== this.#fixed) {
      throw new Error(`Fixed type expected ${this.#fixed}, found ${value}`);
    }
    return value;
  }
  decode (rom: Rom) {
    return this.#validate(this.#uint.decode(rom));
  }
  encode (uint: number, rom: Rom) {
    return this.#uint.encode(this.#validate(uint), rom);
  }
  format (data: number) {
    return this.#hide ? null : this.#uint.format(data);
  }
  parse (data: number) {
    return this.#hide ? this.#fixed : this.#uint.parse(data);
  }
  static isValidArgs (args: Record<string, unknown>): args is FixedArgs {
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
  }
}

class Bool {
  static readonly alias = 'bool';
  #uint: Item<'uint'>;

  constructor (input: { size?: UintArgs['size'] }, api: CompileApi) {
    this.#uint = api.item('uint', { size: input?.size || 'byte' });
  }
  decode (rom: Rom): boolean {
    const uint = this.#uint.decode(rom);
    if (uint > 1) {
      throw new Error(`Bool type expects uint 0x0 or 0x1, found ${uint}`);
    }
    return Boolean(uint);
  }
  encode (bool: boolean, rom: Rom): void {
    if (Boolean(bool) !== bool) {
      throw new Error(`Boolean expected, found ${bool}`);
    }
    return this.#uint.encode(Number(bool), rom);
  }
  format (data: boolean): boolean {
    return data;
  }
  parse (data: boolean): boolean {
    return data;
  }
}

type EnumArgs = UintArgs & {
  values: string[] | Record<number, string>
};

class Enum {
  static readonly alias = 'enum';
  #lookup: Lookup<number, string>;
  #uint: Item<'uint'>;

  constructor ({ values, size }: EnumArgs, api: CompileApi) {
    this.#uint = api.item('uint', { size });
    this.#lookup = (Array.isArray(values)
      ? Lookup.fromArray(values)
      : Lookup.fromNumRecord(values)
    );

    if (!size && Object.keys(values).some(k => parseInt(k) > 0xFF)) {
      throw new Error('Must specify size if enum keys > 0xFF');
    }
  }
  decode (rom: Rom): string {
    const uint = this.#uint.decode(rom);
    return this.#lookup.by_key(uint);
  }
  encode (str: string, rom: Rom): void {
    const uint = this.#lookup.by_value(str);
    return this.#uint.encode(uint, rom);
  }
  format (data: string): string {
    return data;
  }
  parse (data: string): string {
    return data;
  }
  static isValidArgs (args: Record<string, unknown>): args is EnumArgs {
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
    return true;
  }
}

// TODO: Reduce use of `!` for potentially undefined variables
type BPP = 2 | 4;
class Tile {
  static readonly alias = 'tile';
  #bpp: BPP;

  constructor ({ bpp }: { bpp: BPP }) {
    this.#bpp = bpp;
  }
  decode (rom: Rom) {
    const data = new Array(64).fill(0x00);
    const bitplanes = []

    for (let i = 0; i < this.#bpp; i += 2) {
      const plane_a = [];
      const plane_b = i + 1 === this.#bpp ? null : ([] as number[]);

      for (let j = 0; j < 8; j++) {
        plane_a.push(rom.read('byte'));
        if (plane_b) plane_b.push(rom.read('byte'));
      }

      bitplanes.push(plane_a);
      if (plane_b) bitplanes.push(plane_b);
    }

    for (let i = 0, mask = 0x01; i < this.#bpp; i++, mask <<= 1) {
      const bitplane = bitplanes[i];

      for (let j = 0; j < bitplane!.length; j++) {
        const row = bitplane![j];

        for (let k = 0, bit = 0x01; k < 8; k++, bit <<= 1) {
          if (row! & bit) {
            const index = j * 8 + (7 - k);
            data[index] |= mask;
          }
        }
      }
    }

    return data;
  }
  encode (data: number[], rom: Rom) {
    const bitplanes = [];

    for (let i = 0, mask = 0x01; i < this.#bpp; i++, mask <<= 1) {
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

    for (let i = 0; i < this.#bpp; i += 2) {
      const plane_a = bitplanes[i];
      const plane_b = bitplanes[i + 1];

      for (let j = 0; j < 8; j++) {
        rom.write(plane_a![j]!, 'byte');
        if (plane_b) rom.write(plane_b![j]!, 'byte');
      }
    }
  }
  parse (data: string) {
    return data.split('\n').map(line => {
      return line.split('').map(x => parseInt(x, 16));
    }).flat();
  }
  format (list: number[]) {
    return Array(8).fill(undefined).map((_, i) => {
      return list.slice(i * 8, i * 8 + 8).map(n => n.toString(16)).join('');
    }).join('\n');
  }
}

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
