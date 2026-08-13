import { describe, it } from '#test';
import { TypeTester } from '#tests/helpers/type-test.js';
import {
  Range,
  Fork,
  Decorator,
  Decrypter,
  Transformer,
  Maths,
  Custom,
  RefPath
} from '#root/lib/types/ops.js';

describe('Ops', () => {
  const lib_store = new Map();
  const test_ref = [{
    item: { value: 0x05 },
    size: 'byte'
  }];
  const session_api = {
    getLib: (id) => {
      return lib_store.get(id) || [];
    },
    setLib: (id, val) => {
      lib_store.set(id, val);
    },
    transform: (ref, fn) => {
      return ref === 'test_ref' && fn(test_ref);
    }
  };
  const tester = new TypeTester(session_api);
  const api = tester.api;
  const uint8 = api.item('uint', { size: 'byte' });

  describe('Fork', () => {
    it('handles basic control flow', () => {
      const fork = api.item(Fork.alias, {
        control: uint8,
        options: {
          'A': { code: 0x01, item: uint8 },
          'B': { code: 0x02, item: uint8 }
        }
      });

      tester.assertType(fork, {
        uints: [0x01, 0x05], // Control 0x01 (A), Value 0x05
        data: { name: 'A', value: 0x05 },
        readable: { 'A': 0x05 }
      });
    });
  });

  describe('Maths', () => {
    it('handles chained operations', () => {
      const math = api.item(Maths.alias, {
        item: uint8,
        math: [
          { op: 'add', arg: 5 },
          { op: 'multiply', arg: 2 }
        ]
      });

      tester.assertType(math, {
        uints: [0x00],
        data: 10
      });
    });
  });

  describe('Decorator', () => {
    it('handles custom formatting/parsing', () => {
      const dec = api.item(Decorator.alias, {
        item: uint8,
        format: (data) => `val:${data}`,
        parse: (data) => parseInt(data.split(':')[1])
      });

      tester.assertType(dec, {
        uints: [0x05],
        data: 5,
        readable: 'val:5'
      });
    });
  });

  describe('Decrypter', () => {
    it('handles encryption/decryption hooks', () => {
      const dec = api.item(Decrypter.alias, {
        item: uint8,
        decrypt: (data) => data ^ 0xFF,
        encrypt: (data) => data ^ 0xFF
      });

      tester.assertType(dec, {
        uints: [0x00], // 0xFF ^ 0xFF = 0x00
        data: 0xFF
      });
    });
  });

  describe('Range', () => {
    it('handles memory jumps', () => {
      const range = api.item(Range.alias, {
        org: 0x02,
        item: uint8
      });

      tester.assertType(range, {
        uints: [0x00, 0x00, 0x05], // Skip 2 bytes, data at 0x02
        data: 0x05
      });
    });
  });

  describe('Custom', () => {
    it('handles custom implementation', () => {
      const custom = api.item(Custom.alias, {
        decode: () => 0xAA,
        encode: (data, rom) => rom.write(data, 'byte'),
        format: (data) => data.toString(16),
        parse: (data) => parseInt(data, 16)
      });

      tester.assertType(custom, {
        uints: [0xAA],
        data: 0xAA,
        readable: 'aa'
      });
    });
  });

  describe('Transformer', () => {
    it('handles reference transformation', () => {
      const trans = api.item(Transformer.alias, {
        ref: 'test_ref',
        type: 'uint',
        transform: rows => ({
          size: rows[0].size || 'word'
        })
      });

      tester.assertType(trans, {
        uints: [0x05],
        data: 0x05
      });
    });
  });

  describe('RefPath', () => {
    it('handles path based enum lookups', () => {
      const ref_path = api.item(RefPath.alias, {
        size: 'byte',
        ref: 'test_ref',
        path: 'item.value'
      });

      tester.assertType(ref_path, {
        uints: [0x00],
        data: 0x00,
        readable: 0x05
      });
    });
  });
});
