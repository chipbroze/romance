import assert from 'node:assert';
import { describe, it } from '#test';
import { Rom } from '#root/lib/rom.js';

describe('Rom', () => {
  // Helper to create a dummy ROM buffer
  const createBuffer = (size = 0x300200) => new Uint8Array(size).fill(0);

  describe('Initialization', () => {
    it('initializes with hirom', () => {
      const rom = new Rom(createBuffer(), 'hirom');
      assert.ok(rom instanceof Rom);
    });

    it('initializes with lorom', () => {
      const rom = new Rom(createBuffer(0x100200), 'lorom');
      assert.ok(rom instanceof Rom);
    });
  });

  describe('Read/Write', () => {
    it('reads and writes bytes', () => {
      const rom = new Rom(createBuffer(), 'hirom');
      const offset = rom.offset();
      rom.write(0xAA, 'byte');
      rom.offset(offset);
      assert.strictEqual(rom.read('byte'), 0xAA);
    });

    it('throws RomRangeError on out of bounds write', () => {
      const rom = new Rom(new Uint8Array(10), 'hirom'); // Very small ROM
      rom.offset(0xC00000 + 8); // Move to near end
      assert.throws(
        () => rom.write(0xFFFF, 'double'),
        (err) => err.name === 'RomRangeError' && err.kind === 'overflow'
      );
    });
  });

  describe('Jumping (JSR)', () => {
    it('jumps to a specific offset with jsr', () => {
      const rom = new Rom(createBuffer(), 'hirom');
      const offset = rom.offset();
      const jsr_offset = 0xC00100;
      rom.write(0x11, 'byte');
      rom.jsr(jsr_offset, () => {
        rom.write(0x22, 'byte');
        assert.strictEqual(rom.offset(), jsr_offset + 1);
      });
      // Should be back at original offset
      assert.strictEqual(rom.offset(), offset + 1);
    });
  });

  describe('Mounting', () => {
    it('mounts a secondary buffer and accesses it', () => {
      const rom = new Rom(createBuffer(), 'hirom');
      const mount_buffer = new Uint8Array([0xAA, 0xBB]);
      
      rom.mount(mount_buffer, () => {
        // Mount sets base to max(existing_ends). 
        // HiROM end (mapped) is 0xF00000.
        assert.strictEqual(rom.offset(), 0xF00000);
        // Ensure the virtual memory can be read
        assert.strictEqual(rom.read('byte'), 0xAA);
        // Ensure the virtual memory is modified by write()
        rom.peek(() => {
          rom.write(0xCC, 'byte'); // Overwrite 0xBB -> 0xCC
        });
        assert.strictEqual(rom.read('byte'), 0xCC);
        assert.strictEqual(mount_buffer[1], 0xCC);
      });
    });

    it('allows jumping between main ROM and mounted buffer via jsr', () => {
      const rom = new Rom(createBuffer(), 'hirom');
      const mount_buffer = new Uint8Array([0x12, 0x34]);
      const value = 0x99;

      rom.writeAt(0xC00000, value, 'byte'); // Original ROM

      rom.mount(mount_buffer, () => {
        assert.strictEqual(rom.read('byte'), 0x12);
        // Jump back to original ROM
        rom.jsr(0xC00000, () => {
          assert.strictEqual(rom.read('byte'), value);
        });
        // Ensure we are back in mounted context
        assert.strictEqual(rom.read('byte'), 0x34);
      });
    });
  });

  describe('Static Utilities', () => {
    it('calculates size requirements', () => {
      assert.strictEqual(Rom.getSize(0xFF), 'byte');
      assert.strictEqual(Rom.getSize(0xFFFF), 'word');
      assert.strictEqual(Rom.getSize(0xFFFFFF), 'sword');
      assert.strictEqual(Rom.getSize(0x1000000), 'double');
    });
  });
});
