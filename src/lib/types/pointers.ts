
import type {
  Item,
  datasize,
  CompileApi,
  RuntimeApi,
  Rom,
} from '../type-registry.js';

import {
  TypeNode,
} from '../type-registry.js';

import {
  AbstractPassthrough
} from './utils.js';

type DereferenceArgs = {
  item: TypeNode;
  reference: TypeNode;
  org: number;
  warn: number;
  toAddress: (num: number) => number;
  toReference: (num: number) => number;
};

class Dereference {
  static readonly alias = 'dereference';

  readonly #item: TypeNode;
  readonly #reference: TypeNode;
  readonly #org: number;
  readonly #warn: number;
  readonly #toAddress: DereferenceArgs['toAddress'];
  readonly #toReference: DereferenceArgs['toReference'];

  constructor (
    { item, reference, org, warn, toAddress, toReference }: DereferenceArgs
  ) {
    this.#item = item;
    this.#reference = reference;
    this.#org = org;
    this.#warn = warn;
    this.#toAddress = toAddress;
    this.#toReference = toReference;
  }

  static isValidArgs (args: Record<string, unknown>): args is DereferenceArgs {
    if (!(args.item instanceof TypeNode)) {
      throw new Error(`Expected item to be instanceof TypeNode`);
    }
    return true;
  }

  #progress (rom: Rom, api: RuntimeApi) {
    return api.scratch(() => ({
      seen: new Map(),
      frame: rom.frame({
        start: this.#org,
        end: this.#warn
      })
    }));
  }

  decode (rom: Rom) {
    const address = this.#toAddress(this.#reference.decode(rom) as number);
    return rom.jsr({ start: address, end: this.#warn }, () => {
      return this.#item.decode(rom);
    })
  }

  encode (data: unknown, rom: Rom, api: RuntimeApi) {
    const progress = this.#progress(rom, api);
    const key = JSON.stringify(data);

    if (!progress.seen.has(key)) {
      api.trace('index', progress.seen.size);

      rom.with(progress.frame, () => {
        const write_at = rom.offset();
        this.#item.encode(data, rom);
        progress.seen.set(key, write_at);
      });
    }

    const pointer = progress.seen.get(key);
    return this.#reference.encode(this.#toReference(pointer), rom);
  }

  format (data: unknown) {
    return this.#item.format(data);
  }
  parse (data: unknown) {
    return this.#item.parse(data);
  }
}

type ListIndexArgs = {
  org: number;
  warn: number;
  base?: number;
  chunk: number;
  item: TypeNode;
  size?: datasize;
};

class ListIndex extends AbstractPassthrough<Item<'dereference'>> {
  static readonly alias = 'list_index';

  constructor (
    { org, warn, base, chunk, item, size }: ListIndexArgs,
    api: CompileApi
  ) {
    base ??= org;
    size ??= 'byte';

    super({
      item: api.item('dereference', {
        item,
        org,
        warn,
        reference: api.item('uint', { size }),
        toAddress: (index: number): number => base + (index * chunk),
        toReference: (address: number): number => (address - base) / chunk
      })
    })
  }

  static isValidArgs (args: Record<string, unknown>): args is ListIndexArgs {
    if (!(args.item instanceof TypeNode)) {
      throw new Error(`Expected item to be instanceof TypeNode`);
    }
    return true;
  }
}

type PointerArgs = Omit<ListIndexArgs, 'chunk'>;

class Pointer extends AbstractPassthrough<Item<'list_index'>> {
  static readonly alias = 'pointer';

  constructor (args: PointerArgs, api: CompileApi) {
    super({
      item: api.item('list_index', {
        ...args,
        size: args.size ?? 'word',
        chunk: 1
      })
    });
  }
}

type PointerIndexArgs = {
  pointers_org: number;
  pointers_base: number;
  length: number;
} & PointerArgs;

class PointerIndex extends AbstractPassthrough<Item<'list_index'>> {
  static readonly alias = 'pointer_index';

  constructor (
    { pointers_org, pointers_base, length, ...pointer_args}: PointerIndexArgs,
    api: CompileApi
  ) {
    super({
      item: api.item('list_index', {
        item: api.item('pointer', pointer_args),
        org: pointers_org,
        warn: pointers_org + 2 * length,
        base: pointers_base,
        chunk: 2
      })
    });
  }
}

type PointerTableArgs = {
  item: TypeNode;
  length: number;
  org: number;
  warn: number;
  wrap: number
  base: number;
};

class PointerTable {
  static readonly alias = 'pointer_table';
  static readonly kind = 'array';

  #item: TypeNode;
  #org: number;
  #base: number;
  #wrap: number | undefined;
  #warn: number | undefined;
  #wrapper: Item<'uint'> | undefined;
  #pointers: Item<'list'>;

  constructor (
    { item, length, org, warn, wrap, base }: PointerTableArgs,
    api: CompileApi
  ) {
    this.#item = item;
    this.#org = org;
    this.#base = base ?? org;
    this.#wrap = wrap;
    this.#warn = warn;
    this.#wrapper = wrap != null ? api.item('uint', { size: 'word' }) : undefined;
    this.#pointers = api.item({ type: 'list', name: 'pointers' }, {
      item: api.item('xint', { size: 'word' }),
      length
    });
  }

  static isValidArgs (args: Record<string, unknown>): args is PointerTableArgs {
    if (!(args.item instanceof TypeNode)) {
      throw new Error(`Expected item to be instanceof TypeNode`);
    }
    return true;
  }

  decode (rom: Rom, api: RuntimeApi) {
    const list: unknown[] = [];
    const seen = new Map();
    const wrap_at = this.#wrapper ? this.#wrapper.decode(rom) : Infinity;

    for (const pointer of this.#pointers.decode(rom) as number[]) {
      const offset = list.length >= wrap_at ? this.#wrap! : this.#base;
      const org = pointer + offset;

      if (!seen.has(org)) {
        const value = rom.jsr({ start: org, end: this.#warn }, () => {
          api.trace('index', list.length);
          return this.#item.decode(rom);
        });
        seen.set(org, value);
      }

      list.push(seen.get(org));
    }

    return list;
  }

  encode (list: unknown[], rom: Rom, api: RuntimeApi) {
    let seen = new Map();
    const pointers = [];

    let base = this.#base;
    let counter;

    let offset = this.#org;
    const frame = rom.frame({
      start: this.#org,
      end: this.#warn
    });

    if (this.#wrap) {
      counter = api.item('range', {
        org: rom.offset(),
        item: this.#wrapper!
      });
      this.#wrapper!.encode(0, rom);
    }

    for (const item of list) {
      const key = JSON.stringify(item);

      if (!seen.has(key)) {
        if (this.#wrap != null && counter && offset >= this.#wrap && base === this.#base) {
          base = this.#wrap;
          seen = new Map();
          counter.encode(pointers.length, rom);
        }

        seen.set(key, offset - base);

        api.trace('index', pointers.length);
        rom.with(frame, () => {
          this.#item.encode(item, rom);
          offset = rom.offset();
        });
      }

      pointers.push(seen.get(key));
    }

    let unused = this.#warn && this.#warn - offset;
    if (unused) {
      rom.jsr(offset, () => {
        while (unused!--) rom.write(0xFF, 'byte');
      });
    }

    return this.#pointers.encode(pointers, rom);
  }

  format (data: unknown[]) {
    return data.map(item => this.#item.format(item));
  }
  parse (data: unknown[]) {
    return data.map(item => this.#item.parse(item));
  }
}

export {
  Dereference,
  ListIndex,
  Pointer,
  PointerIndex,
  PointerTable
};
