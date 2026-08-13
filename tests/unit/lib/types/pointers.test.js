import { describe, it } from '#test';
import { TypeTester } from '#tests/helpers/type-test.js';
import { Pointer, PointerIndex, PointerTable } from '#root/lib/types/pointers.js';

describe('Pointers', () => {
  const tester = new TypeTester();
  const api = tester.api;

  describe('Pointer', () => {
    it('handles simple pointer dereferencing', () => {
      const ptr = api.item(Pointer.alias, {
        item: api.item('uint', { size: 'byte' }),
        org: 0x02,
        base: 0x00
      });

      tester.assertType(ptr, {
        uints: [0x02, 0x00, 0x05],
        data: 0x05
      });
    });
  });

  describe('PointerIndex', () => {
    it('handles pointer index dereferencing', () => {
      const ptr_idx = api.item(PointerIndex.alias, {
        item: api.item('uint', { size: 'byte' }),
        org: 0x03,
        warn: 0x04,
        base: 0x00,
        pointers_org: 0x01,
        length: 1
      });

      tester.assertType(ptr_idx, {
        uints: [0x00, 0x03, 0x00, 0x05],
        data: 0x05
      });
    });
  });

  describe('PointerTable', () => {
    it('handles pointer table dereferencing', () => {
      const ptr_table = api.item(PointerTable.alias, {
        item: api.item('uint', { size: 'byte' }),
        length: 2,
        org: 0x04,
        warn: 0x06,
        base: 0x00
      });

      tester.assertType(ptr_table, {
        uints: [0x04, 0x00, 0x05, 0x00, 0x05, 0x06],
        data: [0x05, 0x06]
      });
    });
  });
});
