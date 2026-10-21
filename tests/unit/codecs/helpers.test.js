import assert from 'node:assert';
import { describe, it } from '#test';
import {
  hex,
  Lookup,
  getAtPath
} from '#root/codecs/helpers.js';

describe('Utils', () => {
  describe('Hex', () => {
    it('handles initialization and padding', () => {
      const h = hex(0x1, 'byte');
      assert.strictEqual(h.toString(), '0x01');
      assert.strictEqual(h.valueOf(), 1);
    });

    it('handles auto-sizing', () => {
      const h = hex(0x123);
      assert.strictEqual(h.toString(), '0x0123');
    });
  });

  describe('Lookup', () => {
    it('handles array mapping', () => {
      const lookup = Lookup.fromArray(['A', 'B']);
      assert.strictEqual(lookup.byKey(0), 'A');
      assert.strictEqual(lookup.byValue('B'), 1);
    });

    it('handles object mapping', () => {
      const lookup = Lookup.fromRecord({ 'A': 0x01, 'B': 0x02 });
      assert.strictEqual(lookup.byKey('A'), 0x01);
      assert.strictEqual(lookup.byValue(0x02), 'B');
    });

    it('handles number key mapping', () => {
      const lookup = Lookup.fromNumRecord({ '0x01': 'A' });
      assert.strictEqual(lookup.byKey(1), 'A');
    });

    it('throws on missing key', () => {
      const lookup = Lookup.fromRecord({ 'A': 0x01 });
      assert.throws(() => lookup.byKey('C'));
    });
  });

  describe('getAtPath', () => {
    it('handles simple paths', () => {
      const obj = { a: 1 };
      assert.strictEqual(getAtPath(obj, ['a']), 1);
    });

    it('handles nested paths', () => {
      const obj = { a: { b: 2 } };
      assert.strictEqual(getAtPath(obj, ['a', 'b']), 2);
    });
  });
});
