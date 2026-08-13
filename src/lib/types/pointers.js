"use strict";

class Dereference {
  /** @type {"dereference"} */
  static alias = 'dereference';

  constructor ({ item, reference, org, warn, to_address, to_reference }) {
    this.item = item;
    this.org = org;
    this.warn = warn;
    this.reference = reference;
    this.to_address = to_address;
    this.to_reference = to_reference;
  }
  #progress (api) {
    return api.scratch(() => ({ seen: new Map(), frame: null }));
  }
  decode (rom) {
    const address = this.to_address(this.reference.decode(rom));
    return rom.jsr({ start: address, end: this.warn }, () => {
      return this.item.decode(rom);
    })
  }
  encode (data, rom, api) {
    const progress = this.#progress(api);
    const key = JSON.stringify(data);

    if (!progress.frame) {
      progress.frame = rom.frame({
        start: this.org,
        end: this.warn
      });
    }

    if (!progress.seen.has(key)) {
      api.trace({ index: progress.seen.size });
      rom.with(progress.frame, () => {
        const write_at = rom.offset();
        this.item.encode(data, rom);
        progress.seen.set(key, write_at);
      });
    }
    const pointer = progress.seen.get(key);
    return this.reference.encode(this.to_reference(pointer), rom);
  }
  format (data) {
    return this.item.format(data);
  }
  parse (data) {
    return this.item.parse(data);
  }
}

class ListIndex extends Dereference {
  /** @type {"list_index"} */
  static alias = 'list_index';

  constructor ({ org, warn, base, chunk, item, size }, api) {
    base ??= org;
    size ??= 'byte';

    super({
      item,
      org,
      warn,
      reference: api.item('uint', { size }),
      to_address: index => base + (index * chunk),
      to_reference: address => (address - base) / chunk
    }, api)
  }
}

class Pointer extends ListIndex {
  /** @type {"pointer"} */
  static alias = 'pointer';

  constructor ({ item, org, warn, base, size }, api) {
    size ??= 'word';
    super({ item, org, warn, base, size, chunk: 1 }, api);
  }
}

class PointerIndex extends ListIndex {
  /** @type {"pointer_index"} */
  static alias = 'pointer_index';

  constructor ({ item, org, warn, base, pointers_org, pointers_base, length }, api) {
    super({
      item: api.item('pointer', { item, org, warn, base }),
      org: pointers_org,
      warn: pointers_org + 2 * length,
      base: pointers_base,
      chunk: 2
    }, api);
  }
}

class PointerTable {
  /** @type {"pointer_table"} */
  static alias = 'pointer_table';

  constructor ({ item, length, org, warn, wrap, base }, api) {
    this.length = length;
    this.item = item;
    this.org = org;
    this.base = base ?? org;
    this.wrap = wrap;
    this.warn = warn;
    this.wrapper = wrap && api.item('uint', { size: 'word' });
    this.pointers = api.item('list', {
      $name: 'pointers',
      item: api.item('xint', { size: 'word' }),
      length
    });
  }
  decode (rom, api) {
    const list = [];
    const seen = new Map();
    const wrap_at = this.wrapper ? this.wrapper.decode(rom) : Infinity;

    for (const pointer of this.pointers.decode(rom)) {
      const offset = list.length >= wrap_at ? this.wrap : this.base;
      const org = pointer + offset;

      if (!seen.has(org)) {
        const value = rom.jsr({ start: org, end: this.warn }, () => {
          api.trace({ index: list.length });
          return this.item.decode(rom);
        });
        seen.set(org, value);
      }

      list.push(seen.get(org));
    }

    return list;
  }
  encode (list, rom, api) {
    let seen = new Map();
    const pointers = [];

    let base = this.base;
    let counter;

    let offset = this.org;
    const frame = rom.frame({
      start: this.org,
      end: this.warn
    });

    if (this.wrap) {
      counter = api.item('range', {
        org: rom.offset(),
        item: this.wrapper
      });
      this.wrapper.encode(0, rom);
    }

    for (const item of list) {
      const key = JSON.stringify(item);

      if (!seen.has(key)) {
        if (counter && offset >= this.wrap && base === this.base) {
          base = this.wrap;
          seen = new Map();
          counter.encode(pointers.length, rom);
        }

        seen.set(key, offset - base);

        api.trace({ index: pointers.length });
        rom.with(frame, () => {
          this.item.encode(item, rom);
          offset = rom.offset();
        });
      }

      pointers.push(seen.get(key));
    }

    let unused = this.warn - offset;
    if (unused) {
      rom.jsr(offset, () => {
        while (unused--) rom.write(0xFF, 'byte');
      });
    }

    return this.pointers.encode(pointers, rom);
  }
  format (data) {
    return data.map(item => this.item.format(item));
  }
  parse (data) {
    return data.map(item => this.item.parse(item));
  }
}

export {
  Dereference,
  ListIndex,
  Pointer,
  PointerIndex,
  PointerTable
};
