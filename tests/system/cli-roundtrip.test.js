import assert from 'node:assert';
import { describe, it } from '#test';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

const execAsync = promisify(exec);

describe('CLI Roundtrip', () => {
  it('performs a lossless import/dump roundtrip', { slow: true }, async () => {
    function resolvePath (str) {
      return 'tests/fixtures/simple/' + str;
    }

    const rom_path = resolvePath('rom.bin');
    const workspace_dir = resolvePath('workspace/');
    const manifest_path = resolvePath('manifest.yaml');
    const output_rom_path = resolvePath('output.bin');

    // 0. Copy rom to target path
    fs.copyFileSync(rom_path, output_rom_path);

    // 1. Dump (ROM -> Workspace)
    await execAsync(`romance dump -m ${manifest_path} -r ${output_rom_path} -w ${workspace_dir}`);

    // 2. Import (Workspace -> ROM)
    await execAsync(`romance import -m ${manifest_path} -r ${output_rom_path} -w ${workspace_dir}`);

    // 3. Verify
    const original = fs.readFileSync(rom_path);
    const output = fs.readFileSync(output_rom_path);
    
    assert.deepEqual(output, original, 'Output ROM should match input ROM');
    
    // Cleanup
    fs.unlinkSync(output_rom_path);
  });
});
