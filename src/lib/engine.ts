/* Engine */

import type { SchemaGraph, SchemaNode } from './schema-graph.js';
import type { RomFormat } from './rom.js';
import type { SessionApi } from './type-registry.js';
import { Rom } from './rom.js';
import * as assert from './assert.js';

// --- Structural Types & Interfaces ---

type MainApi = Omit<SessionApi, 'transform'>
type Transform = Parameters<SessionApi['transform']>[1];

interface DataSource {
  getReadApi (id: string): { getLib?: SessionApi['getLib'] };
  read (id: string, schema_node: SchemaNode): unknown;
}

interface DataTarget <O> {
  output: O;
  getWriteApi (id: string): { setLib?: SessionApi['setLib'] };
  write (id: string, schema_node: SchemaNode, value: unknown): void;
}

interface FormatOutput {
  data: Map<string, unknown>;
  lib: Map<string, Map<string, unknown>>;
}

type InternalData = Map<string, unknown>;

type EngineOptions = {
  validate?: boolean;
}

// --- Data Implementations ---

class RomData implements DataSource, DataTarget<Uint8Array> {
  #rom: Rom;

  constructor (rom_buffer: Uint8Array, format: RomFormat) {
    this.#rom = new Rom(rom_buffer, format);
  }

  get output() {
    return this.#rom.finalize();
  }

  read (_id: string, schema_node: SchemaNode) {
    return schema_node.decode(this.#rom);
  }

  write (_id: string, schema_node: SchemaNode, value: unknown) {
    schema_node.encode(value, this.#rom);
  }

  getReadApi (_id: string) {
    return {};
  }

  getWriteApi (_id: string) {
    return {};
  }
}

class FormatData implements DataSource, DataTarget<FormatOutput> {
  #data: FormatOutput['data'];
  #lib: FormatOutput['lib'];

  constructor (
    data?: Map<string, unknown>,
    lib?: Map<string, Map<string, unknown>>
  ) {
    this.#data = data || new Map();
    this.#lib = lib || new Map();
  }

  get output (): FormatOutput {
    return {
      data: new Map(this.#data),
      lib: new Map(this.#lib)
    };
  }

  read (id: string, schema_node: SchemaNode): unknown {
    return schema_node.parse(this.#data.get(id));
  }

  write (id: string, schema_node: SchemaNode, value: unknown): void {
    this.#data.set(id, schema_node.format(value));
  }

  getReadApi (id: string) {
    return {
      getLib: (key: string) => {
        return this.#lib.get(id)?.get(key);
      }
    };
  }

  getWriteApi (id: string) {
    return {
      setLib: (key: string, value: unknown) => {
        if (!this.#lib.has(id)) {
          this.#lib.set(id, new Map());
        }
        const target_lib = this.#lib.get(id)!;
        if (target_lib.has(key)) {
          throw new Error(`Cannot overwrite lib key ${key}`);
        }
        target_lib.set(key, value);
      }
    };
  }
}

// --- Session Management ---

class SessionContext {
  #schemas: Map<string, SchemaGraph>;
  #transforms: Map<string, Map<Transform, unknown>>;

  constructor({ schemas }: { schemas: Map<string, SchemaGraph> }) {
    this.#schemas = schemas;
    this.#transforms = new Map();
  }

  get schema_ids(): string[] {
    return [...this.#schemas.keys()];
  }

  #createApi (api: MainApi): SessionApi {
    return {
      ...api,
      transform: <T> (schema_id: string, transform: Transform): T => {
        if (!this.#transforms.has(schema_id)) {
          this.#transforms.set(schema_id, new Map());
        }

        const transform_map = this.#transforms.get(schema_id)!;

        if (!transform_map.has(transform)) {
          const data = api.fetch(schema_id);
          transform_map.set(transform, transform(data));
        }
        return transform_map.get(transform) as T;
      }
    };
  }

  run <T> (
    id: string,
    api: MainApi,
    func: (schema_node: SchemaNode) => T
  ): T {
    const schema = this.#schemas.get(id);

    if (!schema) {
      throw new Error(`Schema non-existent: ${id}`);
    }

    try {
      return schema.execute(this.#createApi(api), func);
    } catch (e) {
      if (e instanceof Error) {
        e.message = `[Schema ${id}]: ${e.message}`;
      }
      throw e;
    }
  }
}

class ReadSession {
  #source: DataSource;
  #cache: InternalData;
  #context: SessionContext;

  constructor ({ source, schemas }: {
    source: DataSource;
    schemas: Map<string, SchemaGraph>;
  }) {
    this.#source = source;
    this.#cache = new Map();
    this.#context = new SessionContext({ schemas });
  }

  #createApi (id: string): MainApi {
    const source_api = this.#source.getReadApi(id);
    return {
      ...source_api, // getLib, setLib
      fetch: this.#fetch.bind(this)
    };
  }

  execute (): InternalData {
    const output = new Map();
    this.#context.schema_ids.forEach(id => {
      output.set(id, this.#fetch(id));
    });
    return output;
  }

  #fetch (id: string): unknown {
    if (!this.#cache.has(id)) {
      this.#cache.set(id, null); // Indicate pending fetch
      const api = this.#createApi(id);
      const result = this.#context.run(id, api, schema_node => {
        return this.#source.read(id, schema_node);
      });
      this.#cache.set(id, result);
    }

    const result = this.#cache.get(id);

    if (result == null) {
      throw new Error(`Fetched ${id} but nothing found`);
    }

    return result;
  }
}

class WriteSession <O> {
  #data: InternalData;
  #target: DataTarget<O>;
  #context: SessionContext;

  constructor({ schemas, data, target }: {
    schemas: Map<string, SchemaGraph>;
    data: InternalData;
    target: DataTarget<O>;
  }) {
    this.#data = data;
    this.#target = target;
    this.#context = new SessionContext({ schemas });
  }

  #createApi (id: string): MainApi {
    const target_api = this.#target.getWriteApi(id);
    return {
      ...target_api, // lib
      fetch: this.#fetch.bind(this)
    };
  }

  execute () {
    this.#context.schema_ids.forEach(id => {
      this.#context.run(id, this.#createApi(id), schema_node => {
        this.#target.write(id, schema_node, this.#data.get(id));
      });
    });
    return this.#target.output;
  }

  #fetch (id: string): unknown {
    const result = this.#data.get(id);
    if (result == null) {
      throw new Error(`Fetched ${id} but nothing found`);
    }
    return result;
  }
}

// --- Engine ---

type HooksList = Array<(data: InternalData) => void>;

class Engine {
  #schemas: Map<string, SchemaGraph>;
  #hooks: HooksList;
  #rom_format: RomFormat;

  constructor ({ schemas, hooks }: {
    schemas: Map<string, SchemaGraph>;
    hooks?: HooksList;
  }) {
    this.#schemas = schemas;
    this.#hooks = hooks || [];
    this.#rom_format = 'hirom';
  }

  import (
    source: FormatOutput,
    rom_buffer: Uint8Array,
    { validate }: EngineOptions = {}
  ) {
    const data = this.parse(source);

    if (validate) {
      const formatted = this.format(data);
      const data_b = this.parse(formatted);
      assert.deepEqual(data, data_b);
    }

    this.#hooks.forEach(hook => hook(data));

    const rom_clone = new Uint8Array(rom_buffer);
    return this.encode(data, rom_clone);
  }

  dump (
    rom_buffer: Uint8Array,
    { validate }: EngineOptions = {}
  ) {
    const data = this.decode(rom_buffer);

    if (validate) {
      const rom_clone = new Uint8Array(rom_buffer);
      this.encode(data, rom_clone);
      const data_b = this.decode(rom_buffer);
      assert.deepEqual(data, data_b);
    }

    this.#hooks.forEach(hook => hook(data));

    return this.format(data);
  }

  decode (rom_buffer: Uint8Array) {
    const rom = new RomData(rom_buffer, this.#rom_format);
    return new ReadSession({
      schemas: this.#schemas,
      source: rom
    }).execute();
  }

  encode (
    data: InternalData,
    rom_buffer: Uint8Array
  ): Uint8Array {
    const rom = new RomData(rom_buffer, this.#rom_format);
    return new WriteSession({
      schemas: this.#schemas,
      data: data,
      target: rom
    }).execute();
  }

  parse ({ data, lib }: FormatOutput) {
    return new ReadSession({
      schemas: this.#schemas,
      source: new FormatData(data, lib)
    }).execute();
  }

  format (data: InternalData) {
    return new WriteSession({
      schemas: this.#schemas,
      data: data,
      target: new FormatData()
    }).execute();
  }
}

export {
  Engine
};

