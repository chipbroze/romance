import assert from 'node:assert';
import { describe, it } from '#test';
import { Project } from '#root/lib/project.js';

describe('Project Schema Compilation', () => {
  it('compiles and executes a simple uint schema', () => {
    const project = Project.from({
      types: [],
      hooks: new Map(),
      schemas: new Map([
        ['root', { item: { $type: 'uint', size: 'byte' } }]
      ])
    });
    
    const engine = project.engine();
    const buffer = new Uint8Array([0x99]);
    const result = engine.decode(buffer);

    assert.equal(result.get('root'), 0x99);
  });
});
