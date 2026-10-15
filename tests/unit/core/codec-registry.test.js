import assert from 'node:assert';
import { describe, it } from '#test';
import '#root/core/codecs.js';
import { CodecRegistry } from '#root/core/codec-registry.js';

describe('CodecRegistry', () => {
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
    const registry = new CodecRegistry([ValidCodec]);
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
      () => new CodecRegistry([InvalidCodec]),
      /Expected "alias" to be type: string/
    );
  });

  it('throws error if construct is missing', () => {
    const InvalidCodec = {
      alias: 'invalid'
    };
    assert.throws(
      () => new CodecRegistry([InvalidCodec]),
      /Missing "construct" function/
    );
  });
});
