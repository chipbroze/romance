/* Rom Reader */

const datasizes = ['byte', 'word', 'sword', 'double'] as const;
type datasize = typeof datasizes[number];
type RomRange = readonly [number, number | null];
type range_error_kind = 'overflow' | 'underflow';
type range_error_mode = 'read' | 'write';
type range_error_context = {
  readonly range: RomRange,
  readonly address: number,
  readonly size: number,
  readonly mode: range_error_mode
};

function capital (str: string): string {
  return str[0] ? str[0].toUpperCase() + str.slice(1) : str;
}

class RomRangeError extends Error {
  constructor (
    public readonly kind: range_error_kind,
    public readonly context: range_error_context
  ) {
    const { address, range, mode } = context;
    super(`${capital(mode)} ${kind} at ${address} outside (${range[0]}, ${range[1]})`);
    this.name = 'RomRangeError';
  }
}

type FrameConfig = {
  readonly view: DataView;
  readonly range: RomRange;
  readonly base: number;
};

class Frame {
  readonly view: DataView;
  readonly range: [number, number];
  readonly base: number;
  cursor: number;

  constructor (config: FrameConfig) {
    this.view = config.view;
    this.range = [
      config.range[0],
      config.range[1] ?? config.view.byteLength
    ];
    this.base = config.base;
    this.cursor = config.range[0];
  }

  get end () {
    return this.base + this.view.byteLength;
  }

  clone (): Frame {
    const frame = new Frame(this);
    frame.cursor = this.cursor;
    return frame;
  }

  checkBounds (size: number): range_error_kind | null {
    const { range, cursor } = this;
    const [start, end] = range;
    return (cursor < start ? 'underflow'
      : cursor + size > end ? 'overflow'
      : null
    );
  }
}

type RomFormat = 'hirom' | 'lorom';
type RomMapper = {
  readonly headered_size: number;
  mapTo (offset: number): number;
  mapFrom (index: number): number;
  checksum (buffer: Uint8Array): number;
}

const rom_mappers: Record<RomFormat, RomMapper> = {
  hirom: {
    headered_size: 0x300200,
    mapTo (offset: number) {
      return offset - 0xC00000;
    },
    mapFrom (index: number) {
      return index + 0xC00000;
    },
    checksum (buffer: Uint8Array) {
      let sum = 0;
      let i;

      for (i = 0; i < 0x200000; i++) {
        sum += buffer[i]!;
      }
      for (i = 0x200000; i < 0x300000; i++) {
        sum += (buffer[i]! << 1);
      }
      return sum & 0xFFFF;
    }
  },
  lorom: {
    headered_size: 0x100200,
    mapTo (offset: number) {
      const address = offset - 0xC00000;
      const bank = address >> 16;
      return (bank << 15) + (address & 0x7FFF);
    },
    mapFrom (index: number) {
      const bank = (index >> 15) << 16;
      const offset = (index & 0x7FFF) | 0x8000;
      return bank + offset + 0xC00000;
    },
    checksum (_buffer: Uint8Array) {
      throw new Error(`Checksum not yet implemented for LoRom`);
    }
  }
};

class Rom {
  readonly #full_buffer: Uint8Array;
  readonly #format: RomFormat | RomMapper;
  readonly #buffer: Uint8Array;
  readonly #mapper: RomMapper;
  #stack: Frame[];

  constructor (full_buffer: Uint8Array, format: RomFormat | RomMapper) {
    const mapper = typeof format === 'string' ? Rom.#getMapper(format) : format;
    const has_header = full_buffer.byteLength >= mapper.headered_size;
    const buffer = full_buffer.subarray(has_header ? 0x200 : 0);
    const main_view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );

    this.#full_buffer = full_buffer;
    this.#format = format;

    this.#buffer = buffer;
    this.#mapper = mapper;
    this.#stack = [new Frame({
      view: main_view,
      range: [0, null],
      base: 0
    })];
  }

  get #state (): Frame {
    return this.#stack[this.#stack.length - 1]!;
  }

  get #index (): number {
    return this.#state.cursor;
  }

  set #index (value: number) {
    this.#state.cursor = value; 
  }

  get #virtual_index () {
    const frame = this.#state;
    return frame.cursor + frame.base;
  }

  set #virtual_index (value: number) {
    const frame = this.#state;
    frame.cursor = value - frame.base;
  }

  get #view (): DataView {
    return this.#state.view;
  }

  #assertBounds (size: number, mode: range_error_mode = 'read'): void {
    const frame = this.#state;
    const error_kind = frame.checkBounds(size);

    if (error_kind != null) {
      throw new RomRangeError(error_kind, {
        range: frame.range,
        address: frame.cursor,
        size,
        mode
      });
    }
  }

  #mapTo (offset: number) {
    return this.#mapper.mapTo(offset);
  }

  #mapFrom (index: number) {
    return this.#mapper.mapFrom(index);
  }

  offset (offset?: number): number {
    if (offset == null) {
      return this.#mapFrom(this.#virtual_index);
    } else {
      this.#virtual_index = this.#mapTo(offset);
      return this.#virtual_index;
    }
  }

  clone (): Rom {
    const clone = new Rom(this.#full_buffer, this.#format);
    clone.#stack = this.#stack.map(frame => frame.clone());
    return clone;
  }

  slice (length: number): Uint8Array {
    const view = this.#view;
    const index = this.#index;

    this.#assertBounds(length, 'read');
    this.#index += length;

    const uint8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return uint8.slice(index, index + length);
  }

  set (source: Uint8Array): number {
    const view = this.#view;
    const index = this.#index;

    this.#assertBounds(source.length, 'write');
    this.#index += source.length;

    const uint8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    uint8.set(source, index);

    return this.#index;
  }

  read (size: datasize): number {
    const i = this.#index;

    const advanceBytes = (num: number): void => {
      this.#assertBounds(num, 'read');
      this.#index += num;
    };

    switch (size) {
      case 'double': {
        advanceBytes(4);
        return this.#view.getUint32(i, true);
      }
      case 'sword': {
        advanceBytes(3);
        return (
          (this.#view.getUint8(i)) +
          (this.#view.getUint16(i + 1, true) << 8)
        );
      }
      case 'word': {
        advanceBytes(2);
        return this.#view.getUint16(i, true);
      }
      case 'byte': {
        advanceBytes(1);
        return this.#view.getUint8(i);
      }
      default: {
        assertNever('read size', size);
      }
    }
  }

  write (value: number, size: datasize): number {
    switch (size) {
    case 'double':
      this.#assertBounds(4, 'write');
      this.#view.setUint32(this.#index, value, true);
      this.#index += 4;
      break;
    case 'sword':
      this.#assertBounds(3, 'write');
      this.#view.setUint16(this.#index, value & 0xFFFF, true);
      this.#view.setUint8(this.#index + 2, value >> 16);
      this.#index += 3;
      break;
    case 'word':
      this.#assertBounds(2, 'write');
      this.#view.setUint16(this.#index, value, true);
      this.#index += 2;
      break;
    case 'byte':
      this.#assertBounds(1, 'write');
      this.#view.setUint8(this.#index, value);
      this.#index += 1;
      break;
    default:
      assertNever('write size', size);
    }

    return this.#index;
  }
  
  readAt (offset: number, size: datasize): number {
    return this.jsr(offset, () => {
      return this.read(size);
    });
  }

  writeAt (offset: number, value: number, size: datasize): number {
    return this.jsr(offset, () => {
      return this.write(value, size);
    });
  }

  peek <T> (handler: () => T): T {
    return this.jsr(this.offset(), handler);
  }

  mount <T> (buffer: Uint8Array, handler: () => T): T {
    const base = Math.max(...this.#stack.map(frame => frame.end));

    return this.with(new Frame({
      range: [0, null],
      view: new DataView(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength
      ),
      base
    }), handler);
  }

  jsr <T> (offset: number, handler: () => T): T;
  jsr <T> (config: { start: number; end?: number }, handler: () => T): T;
  jsr <T> (
    offsetOrConfig: number | { start: number; end?: number },
    handler: () => T
  ): T {
    const config = typeof offsetOrConfig === 'number'
      ? { start: offsetOrConfig }
      : offsetOrConfig;

    return this.with(this.frame(config), handler);
  }

  frame ({ start, end }: { start: number, end?: number }): Frame {
    const range_start = this.#mapTo(start);
    const range_end = end == null ? null : this.#mapTo(end);

    const target = this.#stack.find(frame => {
      return frame.base <= range_start && range_start < frame.end;
    });

    if (!target) {
      throw new Error(`Requested offset ${start} is not available`);
    }

    return new Frame({
      range: [
        range_start - target.base,
        range_end == null ? null : range_end - target.base
      ],
      view: target.view,
      base: target.base
    });
  }

  with <T> (frame: Frame, handler: () => T): T {
    this.#stack.push(frame);
    try {
      return handler.call(this);
    } finally {
      this.#stack.pop();
    }
  }

  finalize (expected_checksum?: number): Uint8Array {
    const checksum = this.#mapper.checksum(this.#buffer);

    if (expected_checksum != null && checksum !== expected_checksum) {
      console.warn(`\n\nWARNING: Checksum does not match expected\n\n`);
    }

    const inverted = checksum ^ 0xFFFF;
    this.writeAt(0xC0FFDE, checksum, 'word');
    this.writeAt(0xC0FFDC, inverted, 'word');

    return this.#full_buffer;
  }

  static #getMapper (format: RomFormat): RomMapper {
    return rom_mappers[format];
  }

  static isValidSize (size: unknown): size is datasize {
    return datasizes.includes(size as datasize);
  }

  static getSize (uint: number): datasize {
    return uint > 0xFFFFFF ? 'double'
      : uint > 0xFFFF ? 'sword'
      : uint > 0xFF ? 'word'
      : 'byte';
  }

  static sizeBytes (size: datasize): 1 | 2 | 3 | 4 {
    switch (size) {
      case 'byte': return 1;
      case 'word': return 2;
      case 'sword': return 3;
      case 'double': return 4;
      default: assertNever('size', size);
    }
  }

  static sizeCap (size: datasize) {
    return Math.pow(2, Rom.sizeBytes(size) * 8);
  }

  static assertRomFormat (format: unknown): asserts format is RomFormat {
    if (typeof format !== 'string' || !(format in rom_mappers)) {
      throw new Error(`Specified Rom format ${format} is not supported`);
    }
  }
}

function assertNever (label: string, value: never): never {
  throw new Error(`Unexpected ${label}: ${value}`);
}

export { Rom };

export type {
  datasize,
  RomFormat,
};
