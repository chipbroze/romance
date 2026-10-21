/* Romance API */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { isObj } from '../utils/types.js';
import { Project } from './project.js';
import { file_formats, isValidFormat } from './file-formats.js';
import { EvilMap } from '../utils/map-utils.js';
import { Rom, type RomFormat } from './rom.js';
import {
  writePath,
  safeImport,
  readDir,
  writeDir,
  safeRead
} from '../utils/fs.js';

import type { Dict } from '../utils/types.js';
import type { Hook, ProfileRegistry } from './project.js';
import type { FormatOutput, EngineOptions } from './engine.js';
import type { FileFormatName } from './file-formats.js';

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

type HookConfig = {
  from: string;
};

type HooksRegistry = Record<string, HookConfig>;

type CodecMapping = Record<string, readonly string[]>

type Manifest = {
  rom_format: RomFormat;
  registry: {
    codecs: CodecMapping;
    schemas: SchemaRegistry;
    hooks: HooksRegistry;
  };
  profiles: ProfileRegistry;
};

type Workspace = FormatOutput;

function toManifest (input: unknown): Manifest {
  const manifest = {
    rom_format: '' as RomFormat,
    registry: {
      schemas: {},
      hooks: {},
      codecs: {}
    },
    profiles: {}
  } as Manifest;

  if (!isObj(input)) {
    throw new Error(`Manifest must be an object`);
  }

  Rom.assertRomFormat(input.rom_format);
  manifest.rom_format = input.rom_format;

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

      if (!isValidFormat(format)) {
        throw new Error(`No file format matching "${format}"`);
      }

      const module = await safeImport<Dict>(from);
      const item = module?.[name];

      if (!isObj(item)) {
        throw new Error(`No schema found at "${from}"`);
      }

      return { name, item, format };
    })
  );

  return new Map(schemas.map((schema) => [schema.name, schema]));
}

type Module = object & {
  default?: unknown | undefined
}

async function getModule (module_path: string) {
  const module = await safeImport<Module>(module_path);
  return (module?.default ?? module);
}

function isHook (hook: unknown): hook is Hook {
  return typeof hook === 'function' && hook.length === 1;
}

async function importHooks (
  hooks_registry: HooksRegistry
): Promise<Map<string, Hook>> {
  const hook_names = Object.keys(hooks_registry);
  const hook_entries = await Promise.all(hook_names.map(
    async (name): Promise<[string, Hook]> => {
      const { from } = hooks_registry[name]!;
      const hook = await getModule(from);
      if (!isHook(hook)) {
        throw new Error(`Hook ${name} is not a valid hook function`);
      }
      return [name, hook];
    }
  ));

  return new Map(hook_entries);
}

async function importCodecs (
  codec_mapping: CodecMapping
): Promise<unknown[]> {
  const codecs = await Promise.all(
    Object.keys(codec_mapping).map(async (path) => {
      const exports = codec_mapping[path]!;
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
      lib: (source.has('.lib')
        ? source.get('.lib')
        : new EvilMap()
      ) as Map<string, Map<string, unknown>>
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

  static from ({ codecs, schemas, hooks, profiles, rom_format }: {
    codecs: unknown[];
    schemas: Map<string, SchemaItem>;
    hooks: Map<string, Hook>;
    profiles: ProfileRegistry;
    rom_format: RomFormat;
  }): Romance {
    const project = Project.from({
      codecs,
      schemas,
      hooks,
      profiles,
      rom_format
    });

    return new Romance({ project, schemas });
  }

  static async fromManifest (manifest: Manifest): Promise<Romance> {
    const { registry, profiles, rom_format } = manifest;

    const codecs = await importCodecs(registry.codecs);
    const schemas = await importSchemas(registry.schemas);
    const hooks = await importHooks(registry.hooks);

    return this.from({
      codecs,
      schemas,
      hooks,
      profiles,
      rom_format
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
