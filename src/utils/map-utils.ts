class CacheMap <K, V, T> extends Map<K, T> {
  #raw: Map<K, V>;
  #transform: (key: K, value: V) => T;

  constructor (
    iterable: Iterable<readonly [K, V]>,
    transform: (key: K, value: V) => T
  ) {
    super();
    this.#raw = new Map<K, V>(iterable);
    this.#transform = transform;
  }

  override get (key: K): T | undefined {
    if (!super.has(key)) {
      if (!this.#raw.has(key)) {
        return undefined;
      }
      const raw_value = this.#raw.get(key)!;
      const transformed = this.#transform(key, raw_value);
      super.set(key, transformed);
    }
    return super.get(key);
  }

  override has (key: K): boolean {
    return this.#raw.has(key);
  }

  override get size (): number {
    return this.#raw.size;
  }

  override keys (): MapIterator<K> {
    return this.#raw.keys();
  }

  override *entries (): MapIterator<[K, T]> {
    for (const key of this.#raw.keys()) {
      yield [key, this.get(key)!];
    }
  }

  override [Symbol.iterator] (): MapIterator<[K, T]> {
    return this.entries();
  }

  override *values (): MapIterator<T> {
    for (const key of this.#raw.keys()) {
      yield this.get(key)!;
    }
  }

  override forEach (
    callback: (value: T, key: K, map: this) => void,
    this_arg?: unknown
  ): void {
    for (const key of this.#raw.keys()) {
      callback.call(this_arg, this.get(key)!, key, this);
    }
  }
}

class EvilMap <K, V> extends Map<K, V> {
  constructor (entries?: ReadonlyArray<readonly [K, V]>) {
    super(entries);

    if (this.size !== (entries?.length || 0)) {
      throw new Error(`Duplicate entries overwritten`);
    }
  }

  override get (key: K): V {
    if (!this.has(key)) {
      throw new Error(`Key "${key}" not found`);
    }
    return super.get(key)!;
  }

  override set (key: K, value: V): this {
    if (this.has(key)) {
      throw new Error(`Key "${key}" already exists`);
    }
    if (key == null) {
      throw new Error(`Null key not allowed`);
    }
    return super.set(key, value);
  }

  inverse (): EvilMap<V, K> {
    return new EvilMap([...this].map(
      ([k, v]): [V, K] => [v, k])
    );
  }

  static from <K, V> (
    entries: Iterable<readonly [K, V]>
  ): EvilMap<K, V> {
    return new EvilMap([...entries]);
  }

  static mapFrom <K, V, K2, V2> (
    entries: Iterable<readonly [K, V]>,
    mapper: (entry: readonly [K, V]) => [K2, V2]
  ): EvilMap<K2, V2> {
    return new EvilMap(Array.from(entries, mapper!) as [K2, V2][]);
  }

  static fromRecord <V> (
    record: Readonly<Record<string, V>>,
  ): EvilMap<string, V> {
    return this.from(Object.entries(record));
  }

  static mapFromRecord <V, K2=string, V2=V> (
    record: Readonly<Record<string, V>>,
    mapper: (entry: readonly [string, V]) => [K2, V2]
  ): EvilMap<K2, V2> {
    return this.mapFrom(Object.entries(record), mapper);
  }

  static fromInteger <V> (
    record: Readonly<Record<string, V>>
  ): EvilMap<number, V> {
    return EvilMap.mapFromRecord(record, ([k, v]) => ([+k, v]));
  }
}

export { CacheMap, EvilMap };
