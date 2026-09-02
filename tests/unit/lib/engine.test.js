import assert from 'node:assert';
import { describe, it } from '#test';
import { TypeRegistry } from '#root/lib/type-registry.js';
import { SchemaGraph } from '#root/lib/schema-graph.js';
import {
  Engine,
  FormatData,
  RomData,
  SessionContext,
  ReadSession,
  WriteSession
} from '#root/lib/engine.js';

// --- Helpers ---

function createMockGraph (id, methods = {}) {
  class MockType {
    static alias = id;
    decode (rom) { return methods.decode?.(rom); }
    encode (val, rom) { return methods.encode?.(val, rom); }
    format (val) { return methods.format?.(val); }
    parse (val) { return methods.parse?.(val); }
  }
  const registry = new TypeRegistry([MockType]);
  return new SchemaGraph(id, registry).compile({ $type: id, $name: id });
}

function randomUint8 () {
  return Math.floor(Math.random() * 256);
}

describe('Engine', () => {
  const mock_rom = new Uint8Array(0x20000);

  function getUintSchema (id) {
    return new Map([
      [id, { item: { $type: 'uint', size: 'byte' } }]
    ]);
  }

  it('performs a roundtrip import and dump', () => {
    const schema_name = 'root';
    const uint = 0x99;

    const engine = Engine.from({
      hooks: [],
      schemas: getUintSchema(schema_name)
    });

    // Dump
    const workspace = engine.dump(new Uint8Array([uint]));
    assert.strictEqual(workspace.data.get(schema_name), uint);

    // Import
    const modified_rom = engine.import(workspace, mock_rom);
    assert.strictEqual(modified_rom[0], uint);
  });

  it('supports hooks to modify internal data', () => {
    const engine = Engine.from({
      hooks: [data => data.set('root', data.get('root') * 2)],
      schemas: getUintSchema('root')
    });

    const workspace = engine.dump(new Uint8Array([23]));
    assert.strictEqual(workspace.data.get('root'), 46);
  });

  describe('RomData', () => {
    it('outputs the initial uint8array', () => {
      const rom_data = new RomData(mock_rom, 'hirom');
      assert.strictEqual(rom_data.output, mock_rom);
    });

    it('supports reading via schema_node.decode()', () => {
      const uint8 = randomUint8();
      mock_rom[0] = uint8;
      const rom_data = new RomData(mock_rom, 'hirom');
      const mock_node = { decode: (rom) => rom.read('byte') };
      const value = rom_data.read(null, mock_node);
      assert.strictEqual(value, uint8);
    });

    it('supports writing via schema_node.encode()', () => {
      const uint8 = randomUint8();
      const rom_data = new RomData(mock_rom, 'hirom');
      const mock_node = { encode: (v, rom) => rom.write(v, 'byte') };
      rom_data.write(null, mock_node, uint8);
      assert.strictEqual(mock_rom[0], uint8);
    });
  });

  describe('FormatData', () => {
    it('outputs data and lib maps', () => {
      const data = new Map([['a', 1]]);
      const lib = new Map([['b', 2]]);
      const format_data = new FormatData(data, lib);
      const output = format_data.output;

      assert.deepEqual(output.data, data);
      assert.deepEqual(output.lib, lib);
    });

    it('manages library storage via getLib() and setLib()', () => {
      const format_data = new FormatData();
      const write_api = format_data.getWriteApi('schema_id');
      const read_api = format_data.getReadApi('schema_id');
      write_api.setLib('meta', 123);
      const meta = read_api.getLib('meta');
      assert.strictEqual(meta, 123);
    });

    it('supports reading via schema_node.parse()', () => {
      const data = new Map([['schema_id', 123]]);
      const format_data = new FormatData(data);
      const mock_node = { parse: x => x };
      const value = format_data.read('schema_id', mock_node);
      assert.strictEqual(value, 123);
    });

    it('supports writing via schema_node.format()', () => {
      const format_data = new FormatData();
      const mock_node = { format: x => x };
      format_data.write('schema_id', mock_node, 123);
      assert.strictEqual(format_data.output.data.get('schema_id'), 123);
    });
  });

  describe('SessionContext', () => {
    it('provides transform() api method', () => {
      const mock_data = [1, 2, 3];
      const schema_id = 'root';
      const mock_id = 'mock';
      const mock_api = {
        fetch: (id) => id === mock_id ? mock_data : null
      };
      const mock_schema = {
        execute: (api) => {
          return api.transform(mock_id, x => [...x, ...x]);
        }
      };
      const schemas = new Map([[schema_id, mock_schema]]);
      const context = new SessionContext({ schemas });
      const value = context.run(schema_id, mock_api);
      assert.deepEqual(value, [1, 2, 3, 1, 2, 3]);
    });
  });

  describe('ReadSession', () => {
    it('executes read session', () => {
      const graph = createMockGraph('test', { parse: () => 'parsed' });
      const session = new ReadSession({
        source: new FormatData(new Map([['test', 123]])),
        schemas: new Map([['test', graph]])
      });
      const result = session.execute();
      assert.strictEqual(result.get('test'), 'parsed');
    });
  });

  describe('WriteSession', () => {
    it('executes write session', () => {
      const graph = createMockGraph('test', { format: (v) => v + 1 });
      const target = new FormatData();
      const session = new WriteSession({
        target,
        data: new Map([['test', 10]]),
        schemas: new Map([['test', graph]])
      });
      session.execute();
      assert.strictEqual(target.output.data.get('test'), 11);
    });
  });
});
