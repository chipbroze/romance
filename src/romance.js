/* Romance API */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Project } from './lib/project.js';
import { file_formats } from './lib/file-formats.js';
import {
  writePath,
  safeImport,
  readDir,
  writeDir,
  safeRead
} from './lib/fs.js';

export { Romance };

function toUint8Array (buffer) {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

async function parseFile (file_path) {
  const ext = path.extname(file_path).slice(1);
  const file = await safeRead(file_path);
  return file_formats.get(ext).parse(file);
}

async function importSchemas (schema_registry) {
  return Promise.all(Object.keys(schema_registry).map(async name => {
    const { from, format='yaml' } = schema_registry[name];
    const item = await safeImport(from).then(module => module[name]);
    return { name, item, format };
  })).then(schemas => {
    return new Map(schemas.map(schema => [schema.name, schema]));
  });
}

async function getModule (path) {
  const module = await safeImport(path);
  return module.default ?? module;
}

async function importHooks (hooks_registry) {
  const hook_names = Object.keys(hooks_registry);
  const hook_entries = await Promise.all(hook_names.map(async (name) => {
    const { from } = hooks_registry[name]; 
    const hook = await getModule(from); 
    return [name, hook];
  }));
  return new Map(hook_entries);
}

async function importTypes (types_path) {
  return types_path ? readDir(types_path, getModule).then(
    map => map?.values(),
    () => null
  ) : [];
}

class Romance {
  #project; #schemas;

  constructor ({ project, schemas }) {
    this.#project = project;
    this.#schemas = schemas;
  }

  async loadWorkspace (workspace_dir) {
    const source = readDir(workspace_dir, async file_path => {
      const file = await safeRead(file_path);
      const ext = path.extname(file_path).slice(1);
      return file_formats.get(ext).parse(file);
    });

    return {
      data: source,
      lib: source.get('.lib')
    };
  }

  async saveWorkspace (workspace_dir, workspace) {
    const schemas = this.#schemas;

    return Promise.all([
      { files: workspace.data, dir: '' },
      { files: workspace.lib, dir: '.lib' }
    ].map(({ files, dir }) => {
      return writeDir(dir, files, async (file_path, data) => {
        const scheme = schemas[file_path] || { format: 'json' };
        const { format } = scheme;
        const file_name = path.join(workspace_dir, `${file_path}.${format}`);
        if (!file_formats.get(format).valid(data)) {
          throw new Error("Invalid format specified");
        }
        const output = file_formats.get(format).format(data);
        return writePath(file_name, output);
      });
    }))
  }

  async import (input) {
    const {
      profile,
      rom,
      workspace,
      flags={}
    } = input;

    const { validate } = flags;
    const engine = this.#project.engine(profile);
    const new_rom = engine.import(workspace, rom, { validate });

    return new_rom;
  }

  async dump (input) {
    const {
      profile,
      rom,
      flags={}
    } = input;

    const { validate } = flags;
    const engine = this.#project.engine(profile);
    const workspace = engine.dump(rom, { validate });

    return workspace;
  }

  static from ({ types, schemas, hooks, profiles }) {
    const project = Project.from({
      types,
      schemas,
      hooks,
      profiles
    });

    return new this({ project, schemas });
  }

  static async fromManifest (manifest) {
    const { registry, profiles } = manifest;

    const types = await importTypes(registry.types_dir);
    const schemas = await importSchemas(registry.schemas);
    const hooks = await importHooks(registry.hooks);

    return this.from({
      types,
      schemas,
      hooks,
      profiles
    });
  }

  static async fromManifestPath (manifest_path) {
    const manifest = await parseFile(manifest_path);
    return this.fromManifest(manifest); 
  }

  static async loadRom (rom_path) {
    return fs.readFile(rom_path).then(toUint8Array);
  }

  static async saveRom (rom_path, rom) {
    return fs.writeFile(rom_path, rom);
  }
}
