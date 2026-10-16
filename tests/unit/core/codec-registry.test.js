import assert from 'node:assert';
import { describe, it } from '#test';
import '#root/core/codecs.js';
import { Codex } from '#root/core/codec-registry.js';

describe('Codex', () => {
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
    const registry = new Codex([ValidCodec]);
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
      () => new Codex([InvalidCodec]),
      /Expected "alias" to be type: string/
    );
  });

  it('throws error if construct is missing', () => {
    const InvalidCodec = {
      alias: 'invalid'
    };
    assert.throws(
      () => new Codex([InvalidCodec]),
      /Missing "construct" function/
    );
  });
});
