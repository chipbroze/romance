import assert from 'node:assert';
import { describe, it } from '#test';
import { TypeRegistry } from '#root/lib/type-registry.js';

describe('TypeRegistry', () => {
  it('registers types with all required methods and alias', () => {
    class ValidType {
      static alias = 'valid';
      encode() {}
      decode() {}
      format() {}
      parse() {}
    }
    const registry = new TypeRegistry([ValidType]);
    assert.strictEqual(registry.get('valid'), ValidType);
  });

  it('throws error if alias is missing', () => {
    class InvalidType {
      // Missing alias
      encode() {}
      decode() {}
      format() {}
      parse() {}
    }
    assert.throws(
      () => new TypeRegistry([InvalidType]),
      /expected "alias" to be type: string/
    );
  });

  it('throws error if a method is missing', () => {
    class InvalidType {
      static alias = 'invalid';
      // Missing encode
      decode() {}
      format() {}
      parse() {}
    }
    assert.throws(
      () => new TypeRegistry([InvalidType]),
      /no "encode" method/
    );
  });
});
