import { describe, it } from '#test';
import { TypeTester } from '#tests/helpers/codec-test.js';
import { TextStr, TextScript } from '#root/codecs/text.js';

describe('Text', () => {
  const tester = new TypeTester();
  const api = tester.api;

  describe('TextStr', () => {
    it('handles fixed length string with padding', () => {
      const text = api.item(TextStr.alias, {
        mode: { key: 'length', arg: 5 },
        pad: 0x00,
        table: {
          0x41: 'A',
          0x00: '_'
        },
        size: 'byte'
      });

      tester.assertType(text, {
        uints: [0x41, 0x41, 0x00, 0x00, 0x00],
        data: 'AA'
      });
    });

    it('handles DTE compressed text', () => {
      const text = api.item(TextStr.alias, {
        mode: { key: 'eol', arg: '<end>' },
        table: {
          0x01: 'AB',
          0x41: 'A',
          0x42: 'B',
          0x00: '_',
          0xFF: '<end>'
        },
        size: 'byte'
      });

      tester.assertType(text, {
        uints: [0x01, 0xFF],
        data: 'AB'
      });
    });
  });

  describe('TextScript', () => {
    it('handles text script serialization', () => {
      const text_script = api.item(TextScript.alias, {
        mode: {
          key: 'eol',
          arg: { name: 'end', value: undefined }
        },
        ops: [{
          name: 'end',
          match: [0xFF],
          item: api.item('empty', {}),
          omit_control: true
        }, {
          name: 'pause',
          match: [0x01],
          item: api.item('uint', { size: 'byte' }),
          omit_control: true
        }],
        table: {
          0x41: 'A',
          0x42: 'B'
        },
        size: 'byte'
      });
  
      tester.assertType(text_script, {
        uints: [0x41, 0x01, 0x05, 0x42, 0xFF],
        data: [
          { name: '__text__', value: 'A' },
          { name: 'pause', value: 0x05 },
          { name: '__text__', value: 'B' }
        ],
        readable: 'A[pause:5]B'
      });
    });
  });
});
