/* Romance API */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Project } from './project.js';
import type { Hook, ProfileRegistry } from './project.js';
import type { FormatOutput, EngineOptions } from './engine.js';
import { file_formats, isValidFormat } from './file-formats.js';
import type { FileFormatName } from './file-formats.js';
import { EvilMap } from '../utils/map-utils.js';
import {
  writePath,
  safeImport,
  readDir,
  writeDir,
  safeRead
} from '../utils/fs.js';

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

type CodecRegistry = Record<string, readonly string[]>

type Manifest = {
  registry: {
    codecs: CodecRegistry;
    schemas: SchemaRegistry;
    hooks: HooksRegistry;
  };
  profiles: ProfileRegistry;
};

type Workspace = FormatOutput;

function toManifest (input: unknown): Manifest {
  const manifest = {
    registry: {
      schemas: {},
      hooks: {},
      codecs: {}
    },
    profiles: {}
  } as Manifest;

  if (!input || typeof input !== 'object') {
    throw new Error(`Manifest must be an object`);
  }

  if ('registry' in input) {
    const registry = input.registry;

    if (!registry || typeof registry !== 'object') {
      throw new Error(`Manifest registry must be an object`);
    }

    if ('schemas' in registry) {
      const schemas = registry.schemas;
      if (!schemas || typeof schemas !== 'object') {
        throw new Error(`Manifest registry schemas must be an object`);
      }
      Object.assign(manifest.registry.schemas, schemas);
    }

    if ('codecs' in registry) {
      const codecs = registry.codecs;
      if (!codecs || typeof codecs !== 'object') {
        throw new Error(`Manifest registry codecs directory must be an object`);
      }
      Object.assign(manifest.registry.codecs, codecs);
    }

    if ('hooks' in registry) {
      const hooks = registry.hooks;
      if (!hooks || typeof hooks !== 'object') {
        throw new Error(`Manifest registry hooks must be an object`);
      }
      Object.assign(manifest.registry.hooks, hooks);
    }
  }

  return manifest;
}

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
      // TODO: Fix this inaccurate safeImport generic
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

async function importCodecs (
  codec_registry: CodecRegistry
): Promise<unknown[]> {
  const codecs = await Promise.all(
    Object.keys(codec_registry).map(async (path) => {
      const exports = codec_registry[path]!;
      const module = await safeImport<Record<string, unknown>>(path);

      if (module == null) {
        throw new Error(`No codec module found at "${path}"`);
      }

      return exports.map(key => module[key]);
    })
  );

  return codecs.flat().filter(Boolean);
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

  async import ({ rom, workspace, profile, flags={} }: {
    rom: Uint8Array;
    workspace: Workspace;
    profile?: string | undefined;
    flags?: EngineOptions | undefined;
  }): Promise<Uint8Array> {
    const engine = this.#project.engine({ profile });
    return engine.import(workspace, rom, flags);
  }

  async dump ({ rom, profile, flags={} }: {
    rom: Uint8Array;
    profile?: string | undefined;
    flags?: EngineOptions | undefined;
  }): Promise<Workspace> {
    const engine = this.#project.engine({ profile });
    return engine.dump(rom, flags);
  }

  static from ({ codecs, schemas, hooks, profiles }: {
    codecs: unknown[];
    schemas: Map<string, SchemaItem>;
    hooks: Map<string, Hook>;
    profiles: ProfileRegistry;
  }): Romance {
    const project = Project.from({
      codecs,
      schemas,
      hooks,
      profiles
    });

    return new Romance({ project, schemas });
  }

  static async fromManifest (manifest: Manifest): Promise<Romance> {
    const { registry, profiles } = manifest;

    const codecs = await importCodecs(registry.codecs);
    const schemas = await importSchemas(registry.schemas);
    const hooks = await importHooks(registry.hooks);

    return this.from({
      codecs,
      schemas,
      hooks,
      profiles
    });
  }

  static async fromManifestPath (manifest_path: string): Promise<Romance> {
    const raw_manifest = await parseFile(manifest_path);
    return this.fromManifest(toManifest(raw_manifest));
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
