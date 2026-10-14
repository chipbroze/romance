import { describe, it } from '#test';
import { TypeTester } from '#tests/helpers/type-test.js';
import {
  Range,
  Modifier,
  View,
  Custom,
  Fork,
  //Script,
  Resolver,
  Entity
} from '#root/codecs/ops.js';

describe('Ops', () => {
  const lib_store = new Map();
  const test_ref = [{
    item: { value: '$05' },
    size: 'byte'
  }];
  const session_api = {
    getLib: (id) => {
      return lib_store.get(id) || [];
    },
    setLib: (id, val) => {
      lib_store.set(id, val);
    },
    fetch: (ref) => {
      return ref === 'test_ref' ? test_ref : null;
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
        options: [
          { name: 'A', match: [0x01], omit_control: true, item: uint8 },
          { name: 'B', match: [0x02], omit_control: true, item: uint8 }
        ]
      });

      tester.assertType(fork, {
        uints: [0x01, 0x05], // Control 0x01 (A), Value 0x05
        data: { name: 'A', value: 0x05 },
        readable: { 'A': 0x05 }
      });
    });
  });

  describe('View', () => {
    it('handles custom formatting/parsing', () => {
      const dec = api.item(View.alias, {
        item: uint8,
        formatter: (data) => `val:${data}`,
        parser: (data) => parseInt(data.split(':')[1])
      });

      tester.assertType(dec, {
        uints: [0x05],
        data: 5,
        readable: 'val:5'
      });
    });

    it('supports "self" state', () => {
      const dec = api.item(View.alias, {
        item: uint8,
        self: { delimit: ':' },
        formatter (data) { return `val${this.delimit}${data}`; },
        parser (data) { return parseInt(data.split(this.delimit)[1]); }
      });

      tester.assertType(dec, {
        uints: [0x05],
        data: 5,
        readable: 'val:5'
      });
    });
  });

  describe('Modifier', () => {
    it('handles encryption/decryption hooks', () => {
      const dec = api.item(Modifier.alias, {
        item: uint8,
        self: { invert: 0xFF },
        decoder (data) { return data ^ this.invert; },
        encoder (data) { return data ^ this.invert; }
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
        construct: () => ({
          decode: () => 0xAA,
          encode: (data, rom) => rom.write(data, 'byte'),
          format: (data) => data.toString(16),
          parse: (data) => parseInt(data, 16)
        })
      });

      tester.assertType(custom, {
        uints: [0xAA],
        data: 0xAA,
        readable: 'aa'
      });
    });
  });

  describe('Resolver', () => {
    it('handles runtime node instantiation', () => {
      const resolver = api.item(Resolver.alias, {
        from: ['test_ref'],
        self: { size: 'word' },
        toNode (self, data) {
          const size = data.test_ref[0].size || self.size;
          return api.item('uint', { size });
        }
      });

      tester.assertType(resolver, {
        uints: [0x05],
        data: 0x05
      });
    });
  });

  describe('Entity', () => {
    it('handles cross-schema entity references', () => {
      const entity = api.item(Entity.alias, {
        size: 'byte',
        from: 'test_ref',
        path: ['item', 'value']
      });

      tester.assertType(entity, {
        uints: [0x00],
        data: 0x00,
        readable: '$05'
      });
    });
  });
});
