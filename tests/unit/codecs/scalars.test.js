import assert from 'node:assert';
import { describe, it } from '#test';
import { TypeTester } from '#tests/helpers/type-test.js';
import {
  Empty,
  Static,
  Uint,
  HexInt,
  Fixed,
  Bool,
  Enum,
  Tile
} from '#root/codecs/scalars.js';

const tester = new TypeTester();

describe('Scalars', () => {
  describe('Empty', () => {
    it('handles empty data', () => {
      tester.assertType(Empty.construct({}), {
        uints: [],
        data: undefined
      });
    });
  });

  describe('Static', () => {
    it('handles static value', () => {
      tester.assertType(Static.construct({ value: 'foo' }), {
        uints: [],
        data: 'foo'
      });
    });
  });

  describe('Uint', () => {
    it('handles byte uints', () => {
      tester.assertType(Uint.construct({ size: 'byte' }), {
        uints: [0x42],
        data: 0x42
      });
    });

    it('handles word uints', () => {
      tester.assertType(Uint.construct({ size: 'word' }), {
        uints: [0x34, 0x12],
        data: 0x1234
      });
    });

    it('handles sword uints', () => {
      tester.assertType(Uint.construct({ size: 'sword' }), {
        uints: [0x78, 0x56, 0x34],
        data: 0x345678
      });
    });

    it('handles double uints', () => {
      tester.assertType(Uint.construct({ size: 'double' }), {
        uints: [0x00, 0x00, 0x00, 0x01],
        data: 0x01000000
      });
    });
  });

  describe('HexInt', () => {
    it('handles hex ints', () => {
      tester.assertType(HexInt.construct({ size: 'byte' }, tester.api), {
        uints: [0x42],
        data: 0x42,
        readable: '0x42'
      });
    });
  });

  describe('Fixed', () => {
    it('handles fixed value', () => {
      tester.assertType(Fixed.construct({ value: 0x42, size: 'byte' }, tester.api), {
        uints: [0x42],
        data: 0x42
      });
    });

    it('handles word fixed value', () => {
      tester.assertType(Fixed.construct({ value: 0x1234, size: 'word' }, tester.api), {
        uints: [0x34, 0x12],
        data: 0x1234
      });
    });

    it('omits value from format via hide: true', () => {
      tester.assertType(Fixed.construct({ value: 0x42, size: 'byte', hide: true }, tester.api), {
        uints: [0x42],
        data: 0x42,
        readable: null
      });
    });

    it('throws on invalid value type', () => {
      assert.throws(() => Fixed.isValidArgs({ value: 'foo', size: 'byte' })); 
    });
  });

  describe('Bool', () => {
    it('handles boolean values', () => {
      tester.assertType(Bool.construct({}, tester.api), {
        uints: [0x01],
        data: true
      });
    });
  });

  describe('Enum', () => {
    it('handles byte enum', () => {
      tester.assertType(Enum.construct({ values: { 0x00: 'off', 0x01: 'on' }, size: 'byte' }, tester.api), {
        uints: [0x01],
        data: 'on'
      });
    });

    it('handles word enum', () => {
      tester.assertType(Enum.construct({ values: { 0x100: 'large' }, size: 'word' }, tester.api), {
        uints: [0x00, 0x01],
        data: 'large'
      });
    });
  });

  describe('Tile', () => {
    it('handles 2bpp tiles', () => {
      const uints = new Array(16).fill(0);
      const data = new Array(64).fill(0);
      uints[0] = 1;
      data[7] = 1;

      tester.assertType(Tile.construct({ bpp: 2 }), {
        uints,
        data,
        readable: [
          '00000001',
          '00000000',
          '00000000',
          '00000000',
          '00000000',
          '00000000',
          '00000000',
          '00000000'
        ].join('\n')
      });
    });

    it('handles 1bpp tiles', () => {
      const uints = new Array(8).fill(0);
      const data = new Array(64).fill(0);
      uints[0] = 1; // 00000001
      data[7] = 1;

      tester.assertType(Tile.construct({ bpp: 1 }), {
        uints,
        data,
        readable: [
          '00000001',
          '00000000',
          '00000000',
          '00000000',
          '00000000',
          '00000000',
          '00000000',
          '00000000'
        ].join('\n')
      });
    });

    it('handles 4bpp tiles', () => {
      const uints = new Array(32).fill(0);
      const data = new Array(64).fill(0);
      uints[0] = 1;
      data[7] = 1;

      // 4bpp uses 4 bitplanes, 32 bytes total.
      // bit 0 of first byte is bitplane 0, row 0, col 7.

      tester.assertType(Tile.construct({ bpp: 4 }), {
        uints,
        data,
        readable: [
          '00000001',
          '00000000',
          '00000000',
          '00000000',
          '00000000',
          '00000000',
          '00000000',
          '00000000'
        ].join('\n')
      });
    });

    it('throws on invalid tile bpp', () => {
      assert.throws(() => Tile.isValidArgs({ bpp: 3 }));
    });
  });

  describe('Argument Validation', () => {
    it('validates Empty args', () => {
      assert.strictEqual(Empty.isValidArgs({}), true);
      assert.throws(() => Empty.isValidArgs(null));
      assert.throws(() => Empty.isValidArgs('string'));
    });

    it('validates Uint args', () => {
      assert.strictEqual(Uint.isValidArgs({ size: 'byte' }), true);
      assert.throws(() => Uint.isValidArgs({ size: 'invalid' }));
    });

    it('validates Bool args', () => {
      assert.strictEqual(Bool.isValidArgs({}), true);
      assert.strictEqual(Bool.isValidArgs({ size: 'word' }), true);
      assert.throws(() => Bool.isValidArgs({ size: 'invalid' }));
    });
  });
});
