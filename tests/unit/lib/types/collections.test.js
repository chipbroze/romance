import { describe, it } from '#test';
import { TypeTester } from '#tests/helpers/type-test.js';
import {
  List,
  Struct,
  Bitfield,
  Bitmask,
  Bitlist,
  MeltedList,
  SegmentList
} from '#root/lib/types/collections.js';

describe('Collections', () => {
  const tester = new TypeTester();
  const api = tester.api;

  describe('List', () => {
    it('handles fixed length list', () => {
      const list = api.item(List.alias, {
        item: api.item('uint', { size: 'byte' }),
        length: 2
      });
      tester.assertType(list, {
        uints: [0x01, 0x02],
        data: [0x01, 0x02]
      });
    });

    it('handles eol terminated list', () => {
      const list = api.item(List.alias, {
        item: api.item('uint', { size: 'byte' }),
        eol: 0xFF
      });
      // Decodes until it sees 0xFF, which it consumes
      tester.assertType(list, {
        uints: [0x01, 0x02, 0xFF],
        data: [0x01, 0x02]
      });
    });

    it('handles end_at terminated list', () => {
      const list = api.item(List.alias, {
        item: api.item('uint', { size: 'byte' }),
        end_at: 0xFF
      });
      tester.assertType(list, {
        uints: [0x01, 0x02],
        data: [0x01, 0x02],
        context: Array(2).concat(0xFF)
      });
    });
  });

  describe('Struct', () => {
    it('handles simple struct', () => {
      const struct = api.item(Struct.alias, {
        fields: [
          { name: 'a', item: api.item('uint', { size: 'byte' }) },
          { name: 'b', item: api.item('uint', { size: 'word' }) }
        ]
      });
      tester.assertType(struct, {
        uints: [0x01, 0x34, 0x12],
        data: { a: 0x01, b: 0x1234 }
      });
    });
  });

  describe('Bitfield', () => {
    it('handles bitfield with multiple fields', () => {
      const bitfield = api.item(Bitfield.alias, {
        fields: [{
          name: 'a',
          mask: 0x0F,
          item: api.item('uint', { size: 'byte' })
        }, {
          name: 'b',
          mask: 0xF0,
          item: api.item('uint', { size: 'byte' })
        }]
      });

      tester.assertType(bitfield, {
        uints: [0xA1],
        data: { a: 0x01, b: 0x0A }
      });
    });
  });

  describe('Bitmask', () => {
    it('handles bitmask with flags', () => {
      const bitmask = api.item(Bitmask.alias, {
        size: 'byte',
        flags: ['a', 'b']
      });

      tester.assertType(bitmask, {
        uints: [0x03],
        data: ['a', 'b']
      });

      tester.assertType(bitmask, {
        uints: [0x02],
        data: ['b']
      });
    });

    it('handles bitmask with states', () => {
      const bitmask = api.item(Bitmask.alias, {
        size: 'byte',
        flags: ['a', 'b'],
        states: {
          0xFF: 'none'
        }
      });

      tester.assertType(bitmask, {
        uints: [0xFF],
        data: 'none'
      });
    });
  });

  describe('Bitlist', () => {
    it('handles bitlist', () => {
      const bitlist = api.item(Bitlist.alias, {
        item: api.item('uint', { size: 'byte' }),
        length: 2,
        bitsize: 4
      });

      tester.assertType(bitlist, {
        uints: [0x21],
        data: [0x01, 0x02]
      });
    });

    it('handles bitlist with pad', () => {
      const bitlist = api.item(Bitlist.alias, {
        item: api.item('uint', { size: 'byte' }),
        length: 1,
        bitsize: 4,
        pad: 0x05
      });

      tester.assertType(bitlist, {
        uints: [0x51],
        data: [0x01]
      });
    });
  });

  describe('MeltedList', () => {
    it('handles melted list', () => {
      const uint = api.item('uint', { size: 'byte' });
      const melted = api.item(MeltedList.alias, {
        fields: [
          { name: 'a', item: api.item('list', { length: 1, item: uint }) },
          { name: 'b', item: api.item('list', { length: 1, item: uint }) }
        ]
      });

      tester.assertType(melted, {
        uints: [0x01, 0x02],
        data: [{ a: 0x01, b: 0x02 }]
      });
    });

    it('handles melted list with base', () => {
      const uint = api.item('uint', { size: 'byte' });
      const struct = api.item('struct', {
        fields: [{ name: 'val', item: uint }]
      });
      const melted = api.item(MeltedList.alias, {
        base: 'a',
        fields: [
          { name: 'a', item: api.item('list', { length: 1, item: struct }) },
          { name: 'b', item: api.item('list', { length: 1, item: uint }) }
        ]
      });

      tester.assertType(melted, {
        uints: [0x01, 0x02],
        data: [{ val: 0x01, b: 0x02 }]
      });
    });
  });

  describe('SegmentList', () => {
    it('handles segment list', () => {
      const segment = api.item(SegmentList.alias, {
        item: api.item('uint', { size: 'byte', foo: true }),
        length: 1,
        org: 0x04,
        base: 0x00,
        size: 'word'
      });

      tester.assertType(segment, {
        uints: [0x04, 0x00, 0x05, 0x00, 0x42],
        data: [[0x42]]
      });
    });
  });
});
