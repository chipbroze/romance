import assert from 'node:assert';
import { describe, it } from '#test';
import '#root/lib/types.js';
import { TypeRegistry } from '#root/lib/type-registry.js';

describe('TypeRegistry', () => {
  it('registers types with all required methods and alias', () => {
    const ValidCodec = {
      alias: 'valid',
      construct: () => ({
        encode() {},
        decode() {},
        format() {},
        parse() {}
      })
    };
    const registry = new TypeRegistry([ValidCodec]);
    assert.strictEqual(registry.get('valid'), ValidCodec);
  });

  it('throws error if alias is missing', () => {
    const InvalidCodec = {
      // Missing alias
      construct: () => ({
        encode() {},
        decode() {},
        format() {},
        parse() {}
      })
    };
    assert.throws(
      () => new TypeRegistry([InvalidCodec]),
      /Expected "alias" to be type: string/
    );
  });

  it('throws error if construct is missing', () => {
    const InvalidCodec = {
      alias: 'invalid'
    };
    assert.throws(
      () => new TypeRegistry([InvalidCodec]),
      /Missing "construct" function/
    );
  });
});
