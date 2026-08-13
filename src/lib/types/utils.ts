"use strict";

import { Rom } from '../rom.js';
import type {
  datasize,
  TypeNode,
  NodeData,
  NodeFormat
} from '../type-registry.js';

class Hex {
  #value: number | null;
  #len: number;

  constructor (uint: number | null, size: datasize) {
    this.#value = uint;
    this.#len = uint ? this.#getLength(size) : 0;
  }
  #getLength (size: datasize) {
    return Rom.sizeBytes(size) * 2;
  }
  toJSON () {
    return this.toString();
  }
  valueOf () {
    return this.#value;
  }
  toString () {
    if (this.#value == null) return 'null';
    const hexstr = this.#value.toString(16).toUpperCase();
    return `0x${hexstr.padStart(this.#len, '0')}`;
  }
}

function hex (uint: number | string, size?: datasize) {
  // Supports parsing hex string and decimal number versions
  const value = (uint === 'null' ? null
    : typeof uint === 'number' ? uint
    : parseInt(uint, 16)
  );

  if (!size && typeof value === 'number') {
    size = Rom.getSize(value);
  } else if (!size) {
    size = 'byte';
  }

  return new Hex(value, size);
}

class Lookup <K, V> {
  #lookup = new Map<K, V>();
  #invert = new Map<V, K>();

  constructor(entries?: Iterable<readonly [K, V]>) {
    if (entries) {
      for (const [key, value] of entries) {
        this.#lookup.set(key, value);
        this.#invert.set(value, key);
      }
    }
  }

  #by <K2, V2> (
    x: K2,
    map: Map<K2, V2>,
    label: 'Key' | 'Value',
    fallback?: (x: K2) => V2
  ): V2 {
    if (map.has(x)) {
      return map.get(x)!;
    } else if (fallback) {
      return fallback(x);
    } else {
      throw new Error(`${label} ${x} not found in lookup`);
    }
  }

  hasKey (key: K): boolean {
    return this.#lookup.has(key);
  }

  hasValue (value: V): boolean {
    return this.#invert.has(value);
  }

  by_key (key: K, to_value?: (key: K) => V): V {
    return this.#by(key, this.#lookup, 'Key', to_value);
  }

  by_value (value: V, to_key?: (value: V) => K): K {
    return this.#by(value, this.#invert, 'Value', to_key);
  }

  static fromArray <V> (values: readonly V[]): Lookup<number, V> {
    return new Lookup(values.map((v, i) => [i, v]));
  }
  static fromRecord <V> (values: Record<string, V>): Lookup<string, V> {
    return new Lookup(Object.entries(values));
  }
  static fromNumRecord <V> (values: Record<string, V>): Lookup<number, V> {
    return new Lookup(Object.entries(values).map(([k, v]) => [Number(k), v]));
  }
}

abstract class AbstractPassthrough <
  T extends TypeNode,
  Data=NodeData<T>,
  Formatted=NodeFormat<T>
> {
  #item: T;

  constructor ({ item }: { item: T }) {
    this.#item = item;
  }
  decode (rom: Rom): Data {
    return this.#item.decode(rom) as unknown as Data;
  }
  encode (data: Data, rom: Rom): void {
    this.#item.encode(data, rom);
  }
  format (data: Data): Formatted {
    return this.#item.format(data) as unknown as Formatted;
  }
  parse (data: Formatted): Data {
    return this.#item.parse(data) as unknown as Data;
  }
}

function getAtPath (node: unknown, path: string[]) {
  if (path) {
    for (const prop of path) {
      node = (node as Record<string, unknown>)[prop];
    }
  }
  return node;
}

export {
  Hex,
  hex,
  Lookup,
  AbstractPassthrough,
  getAtPath
};
