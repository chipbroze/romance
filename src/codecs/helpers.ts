
import type { Dict } from '../utils/types.js';
import { Rom } from '../core/rom.js';
import type {
  Datasize,
  CodecNode,
  CodecInstance,
  CodecKind
} from '../codec-kit.js';

class Hex {
  #value: number | null;
  #len: number;

  constructor (uint: number | null, size: Datasize) {
    this.#value = uint;
    this.#len = uint ? this.#getLength(size) : 0;
  }
  #getLength (size: Datasize) {
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

function hex (uint: number | string, size?: Datasize) {
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

  // TODO: Remove these deprecated method aliases
  by_key = this.byKey.bind(this);
  by_value = this.byValue.bind(this);

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

  byKey (key: K, to_value?: (key: K) => V): V {
    return this.#by(key, this.#lookup, 'Key', to_value);
  }

  byValue (value: V, to_key?: (value: V) => K): K {
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

function getAtPath (node: unknown, path: string[]) {
  if (path) {
    for (const prop of path) {
      node = (node as Record<string, unknown>)[prop];
    }
  }
  return node;
}

function asNode <Item extends CodecNode> (item: Item) {
  return item as CodecNode<Item['<Data>'], Item['<Formatted>']>;
}

function passthrough <Data, Formatted> (
  node: CodecNode<Data, Formatted>
): CodecInstance<Data, Formatted> {
  return {
    kind: node.kind,
    decode: (rom) => node.decode(rom),
    encode: (data, rom) => node.encode(data, rom),
    format: (data) => node.format(data),
    parse: (data) => node.parse(data)
  };
}

function getKind (x: unknown): CodecKind {
  const type = Array.isArray(x) ? 'array' : typeof x;
  switch (type) {
    case 'function':
    case 'bigint':
    case 'symbol':
      return 'unknown';
    case 'undefined':
      return 'void';
    default: {
      return type;
    }
  }
}

function hasOnlyOne (obj: Dict, keys: string[]) {
  return keys.filter(k => k in obj).length === 1;
}

export {
  Hex,
  hex,
  Lookup,
  getAtPath,
  asNode,
  passthrough,
  getKind,
  hasOnlyOne
};
