import assert from 'node:assert';
import { describe, it } from '#test';
import { Engine } from '#root/lib/engine.js';

describe('Engine', () => {
  const mock_rom = new Uint8Array(0x20000);

  it('performs a roundtrip import and dump', () => {
    const schema_name = 'root';
    const uint = 0x99;

    const engine = Engine.from({
      hooks: new Map(),
      schemas: new Map([
        [schema_name, { item: { $type: 'uint', size: 'byte' } }]
      ])
    });

    // Dump
    const workspace = engine.dump(new Uint8Array([uint]));
    assert.strictEqual(workspace.data.get(schema_name), uint);

    // Import
    const modified_rom = engine.import(workspace, mock_rom);
    assert.strictEqual(modified_rom[0], 0x99);
  });
});

