/* Romance API */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Project } from './lib/project.js';
import type { Hook, ProfileRegistry } from './lib/project.js';
import type { FormatOutput, EngineOptions } from './lib/engine.js';
import { file_formats, isValidFormat } from './lib/file-formats.js';
import type { FileFormatName } from './lib/file-formats.js';
import { EvilMap } from './lib/map-utils.js';
import {
  writePath,
  safeImport,
  readDir,
  writeDir,
  safeRead
} from './lib/fs.js';

type SchemaConfig = {
  from: string;
  format?: string;
};

type SchemaRegistry = Record<string, SchemaConfig>;

type SchemaItem = {
  name: string;
  item: unknown;
  format: FileFormatName;
};

type SchemaModule = Record<string, SchemaItem>;

type HookConfig = {
  from: string;
};

type HooksRegistry = Record<string, HookConfig>;

type Manifest = {
  registry: {
    types_dir?: string;
    schemas: SchemaRegistry;
    hooks: HooksRegistry;
  };
  profiles: ProfileRegistry;
};

type Workspace = FormatOutput;

function toUint8Array (buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

async function parseFile (file_path: string): Promise<unknown> {
  const ext = path.extname(file_path).slice(1);
  const file = await safeRead(file_path);

  if (file == null) {
    throw new Error(`No file found at "${file_path}"`);
  }

  return file_formats.get(ext).parse(file);
}

async function importSchemas (
  schema_registry: SchemaRegistry
): Promise<Map<string, SchemaItem>> {
  const schemas = await Promise.all(
    Object.keys(schema_registry).map(async (name) => {
      const { from, format='yaml' } = schema_registry[name]!;
      const module = await safeImport<SchemaModule>(from);

      if (module == null) {
        throw new Error(`No schema module found at "${from}"`);
      }
      if (!isValidFormat(format)) {
        throw new Error(`No file format matching "${format}"`);
      }
      const item = module[name];
      return { name, item, format };
    })
  );

  return new Map(schemas.map((schema) => [schema.name, schema]));
}

type Module = object & {
  default?: unknown | undefined
}

async function getModule <T> (module_path: string): Promise<T> {
  const module = await safeImport<Module>(module_path);
  return (module?.default ?? module) as T; // TODO: Where to validate Hook?
}

async function importHooks (
  hooks_registry: HooksRegistry
): Promise<Map<string, Hook>> {
  const hook_names = Object.keys(hooks_registry);
  const hook_entries = await Promise.all(hook_names.map(
    async (name): Promise<[string, Hook]> => {
      const { from } = hooks_registry[name]!;
      const hook = await getModule<Hook>(from);
      return [name, hook];
    }
  ));

  return new Map(hook_entries);
}

async function importTypes (
  types_path?: string
): Promise<Iterable<unknown> | null> {
  if (!types_path) return [];
  return readDir(types_path, getModule).then(
    (map) => map.values(),
    () => null
  );
}

class Romance {
  #project: Project;
  #schemas: Map<string, SchemaItem>;

  constructor ({ project, schemas }: {
    project: Project;
    schemas: Map<string, SchemaItem>;
  }) {
    this.#project = project;
    this.#schemas = schemas;
  }

  async loadWorkspace (workspace_dir: string): Promise<Workspace> {
    const source = await readDir(workspace_dir, async (file_path: string) => {
      const file = await safeRead(file_path);
      if (file == null) throw new Error(`No file found at "${file_path}"`);
      const ext = path.extname(file_path).slice(1);
      return file_formats.get(ext).parse(file);
    });

    if (!(source instanceof EvilMap)) {
      throw new Error(`Workspace at "${workspace_dir}" must be a directory`);
    }

    return {
      data: source as Map<string, unknown>,
      lib: source.get('.lib') as Map<string, Map<string, unknown>>
    };
  }

  async saveWorkspace (
    workspace_dir: string,
    workspace: Workspace
  ): Promise<void[]> {
    const schemas = this.#schemas;

    return Promise.all([
      { files: workspace.data, dir: '' },
      { files: workspace.lib, dir: '.lib' }
    ].map(({ files, dir }) => {
      return writeDir(dir, files, async (file_path: string, data: unknown) => {
        const scheme = schemas.get(file_path) || { format: 'json' };
        const { format } = scheme;
        const file_name = path.join(workspace_dir, `${file_path}.${format}`);
        const formatter = file_formats.get(format);

        if (!formatter.valid(data)) {
          throw new Error("Invalid format specified");
        }

        const output = formatter.format(data);
        return writePath(file_name, output);
      });
    }));
  }

  async import ({ profile, rom, workspace, flags={} }: {
    profile?: string;
    rom: Uint8Array;
    workspace: Workspace;
    flags?: EngineOptions;
  }): Promise<Uint8Array> {
    const engine = this.#project.engine({ profile });
    return engine.import(workspace, rom, flags);
  }

  async dump ({ profile, rom, flags={} }: {
    profile?: string;
    rom: Uint8Array;
    flags?: EngineOptions;
  }): Promise<Workspace> {
    const engine = this.#project.engine({ profile });
    return engine.dump(rom, flags);
  }

  static from ({ types, schemas, hooks, profiles }: {
    types?: Iterable<unknown> | null;
    schemas: Map<string, SchemaItem>;
    hooks: Map<string, Hook>;
    profiles: ProfileRegistry;
  }): Romance {
    const project = Project.from({
      types: Array.from(types || []),
      schemas,
      hooks,
      profiles
    });

    return new Romance({ project, schemas });
  }

  static async fromManifest (manifest: Manifest): Promise<Romance> {
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

  static async fromManifestPath (manifest_path: string): Promise<Romance> {
    const manifest = await parseFile(manifest_path) as Manifest;
    return this.fromManifest(manifest);
  }

  static async loadRom (rom_path: string): Promise<Uint8Array> {
    const buffer = await fs.readFile(rom_path);
    return toUint8Array(buffer);
  }

  static async saveRom(rom_path: string, rom: Uint8Array): Promise<void> {
    return fs.writeFile(rom_path, rom);
  }
}

export { Romance };
