/* fs wrappers and helpers */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { EvilMap } from './map-utils.js';

const require = createRequire(import.meta.url);

async function loadModule <T> (path: string): Promise<T> {
  try {
    return require(path);
  } catch (e) {
    // TODO: Improve type of errors to simplify this
    if (e && typeof e === 'object' && "code" in e && e.code === 'ERR_REQUIRE_ESM') {
      return import(path);
    } else {
      throw e;
    }
  }
}

function safeImport <T> (file_path: string): Promise<T | null> {
  return safeFile(
    file_path,
    absolute_path => loadModule(absolute_path)
  );
}

function safeRead (file_path: string): Promise<string | null> {
  return safeFile(
    file_path,
    absolute_path => fs.readFile(absolute_path, 'utf-8')
  );
}

async function safeFile <T> (
  file_path: string,
  then: (absolute_path: string) => Promise<T>
): Promise<T | null> {
  const absolute_path = path.resolve(file_path);
  return fs.access(absolute_path, fs.constants.R_OK).then(
    () => then(absolute_path),
    () => null
  );
}

type DirectoryTree <T> = T | EvilMap<string, DirectoryTree<T>>;

async function readDir <T> (
  file_path: string,
  readFile: (file_path: string) => Promise<T>
): Promise<DirectoryTree<T>> {
  const stats = await fs.stat(file_path); 

  if (!stats.isDirectory()) {
    return readFile(file_path);
  }

  const children = await fs.readdir(file_path);
  const child_entries = await Promise.all(children.filter(child => {
    return path.extname(child) !== '.swp'; // TODO: Improve ignore patterns
  }).map(async child => {
    const child_path = path.join(file_path, child);
    const name = path.basename(child, path.extname(child));
    const result = await readDir(child_path, readFile);
    return [name, result] as const;
  }));

  return new EvilMap(child_entries);
}

async function writeDir <T> (
  dir_path: string,
  data: T,
  writeFile: (file_path: string, data: T) => Promise<void>
): Promise<void> {
  if (!(data instanceof Map)) {
    await writeFile(dir_path, data);
    return;
  }

  await Promise.all([...data.entries()].map(([key, value]) => {
    const child_path = path.join(dir_path, key);
    return writeDir(child_path, value, writeFile);
  }));
}

async function writePath (
  file_path: string,
  output: string
): Promise<void> {
  await fs.mkdir(path.dirname(file_path), { recursive: true });
  await fs.writeFile(file_path, output);
}

export {
  safeImport,
  safeRead,
  safeFile,
  readDir,
  writeDir,
  writePath
};
