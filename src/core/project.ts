/* Project */

import { Engine } from './engine.js';
import { CodecRegistry } from './codec-registry.js';
import { SchemaGraph } from './schema-graph.js';
import { CacheMap, EvilMap } from '../utils/map-utils.js';
import { type RomFormat } from './rom.js';

type Hook = (data: unknown) => void;

type ProfileConfig = {
  schemas?: 'all' | Iterable<string>;
  hooks?: 'all' | Iterable<string>;
};

type ProfileRegistry = Record<string, ProfileConfig>;

class Project {
  #schemas: CacheMap<
    string,
    { item: unknown },
    ReturnType<InstanceType<typeof SchemaGraph>['compile']>
  >;
  #hooks: Map<string, Hook>;
  #explicit_profiles?: Record<string, ProfileConfig>;
  #rom_format: RomFormat;

  constructor ({ codex, schemas, hooks, profiles, rom_format }: {
    codex: CodecRegistry;
    schemas: Map<string, { item: unknown }>;
    hooks: Map<string, Hook>;
    profiles?: ProfileRegistry | undefined;
    rom_format: RomFormat;
  }) {
    this.#schemas = new CacheMap(schemas.entries(), (id, schema) => {
      return new SchemaGraph(id, codex).compile(schema.item);
    });
    this.#hooks = hooks;
    this.#explicit_profiles = profiles || {};
    this.#rom_format = rom_format;
  }

  static from ({ codecs, schemas, hooks, profiles, rom_format }: {
    codecs: unknown[];
    schemas: Map<string, { item: unknown }>;
    hooks: Map<string, Hook>;
    profiles?: Record<string, ProfileConfig>;
    rom_format: RomFormat;
  }): Project {
    return new Project({
      codex: new CodecRegistry(codecs),
      schemas: EvilMap.from(schemas),
      hooks: EvilMap.from(hooks),
      profiles,
      rom_format
    });
  }

  get #profiles (): Record<string, ProfileConfig> {
    return {
      default: {
        schemas: 'all',
        hooks: []
      },
      ...this.#explicit_profiles
    };
  }

  engine ({ profile, overrides }: {
    profile?: string | undefined;
    overrides?: ProfileConfig | undefined;
  } = {}): Engine {
    const profile_obj: ProfileConfig = {
      ...(this.#profiles[profile!] || this.#profiles.default),
      ...overrides
    };

    function filterMap <V> (
      map: Map<string, V> | CacheMap<string, unknown, V>,
      keys: 'all' | Iterable<string> = 'all'
    ): EvilMap<string, V> {
      const allow = new Set(keys === 'all' ? map.keys() : keys);
      const allowed = (entry: [string, unknown]): entry is [string, V] => {
        return allow.has(entry[0]);
      };
      return new EvilMap([...map].filter(allowed));
    }

    const schemas = filterMap(this.#schemas, profile_obj.schemas);
    const hooks = [...filterMap(this.#hooks, profile_obj.hooks).values()];
    const rom_format = this.#rom_format;

    return new Engine({ schemas, hooks, rom_format });
  }
}

export { Project };
export type { Hook, ProfileRegistry };
