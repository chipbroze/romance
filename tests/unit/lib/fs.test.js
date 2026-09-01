import assert from 'node:assert';
import { describe, it } from '#test';
import { safeRead, readDir, writeDir } from '#root/lib/fs.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

// Helper function to handle temp directory creation + automatic cleanup
async function createTempDir (t, prefix = 'fs-test-') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  return dir;
}

describe('fs', () => {
  describe('safeRead()', () => {
    it('returns content of an existing file', async (t) => {
      const tmp_dir = await createTempDir(t);
      const file_path = path.join(tmp_dir, 'test.txt');
      await fs.writeFile(file_path, 'hello');

      const content = await safeRead(file_path);
      assert.strictEqual(content, 'hello');
    });

    it('returns null for a non-existent file', async () => {
      const content = await safeRead('./does-not-exist.txt');
      assert.strictEqual(content, null);
    });
  });

  describe('readDir() and writeDir()', () => {
    it('recursively reads directory tree', async (t) => {
      const tmp_dir = await createTempDir(t);

      const file_a = path.join(tmp_dir, 'a.txt');
      const sub_dir = path.join(tmp_dir, 'sub');
      const file_b = path.join(sub_dir, 'b.txt');

      await fs.mkdir(sub_dir);
      await fs.writeFile(file_a, 'content-a');
      await fs.writeFile(file_b, 'content-b');

      const tree = await readDir(tmp_dir, async (p) => fs.readFile(p, 'utf-8'));

      assert.strictEqual(tree.get('a'), 'content-a');
      const sub = tree.get('sub');
      assert.ok(sub instanceof Map);
      assert.strictEqual(sub.get('b'), 'content-b');
    });

    it('recursively writes directory tree', async (t) => {
      const out_dir = await createTempDir(t, 'fs-dir-out-test-');
      const file_a = path.join(out_dir, 'a');
      const file_b = path.join(out_dir, 'sub', 'b');

      const tree = new Map([
        ['a', 'content-a'],
        ['sub', new Map([
          ['b', 'content-b']
        ])]
      ]);

      await writeDir(out_dir, tree, async (p, data) => {
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, data);
      });
      
      assert.strictEqual(await fs.readFile(file_a, 'utf-8'), 'content-a');
      assert.strictEqual(await fs.readFile(file_b, 'utf-8'), 'content-b');
    });
  });
});

