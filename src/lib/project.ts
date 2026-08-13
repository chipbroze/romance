/* Project */

import { Engine } from './engine.js';
import { TypeRegistry } from './type-registry.js';
import { SchemaGraph } from './schema-graph.js';
//import type { CompileApi, RuntimeApi } from './schema-graph.js';
import { CacheMap, EvilMap } from './map-utils.js';

type Hook = (data: unknown) => void;

type ProfileConfig = {
  [key: string]: unknown;
  schemas?: 'all' | Iterable<string>;
  hooks?: 'all' | Iterable<string>;
};

class Project {
  #schemas: CacheMap<
    string,
    { item: unknown },
    ReturnType<InstanceType<typeof SchemaGraph>['compile']>
  >;
  #hooks: Map<string, Hook>;
  #explicit_profiles?: Record<string, ProfileConfig>;

  constructor ({ typeset, schemas, hooks, profiles }: {
    typeset: TypeRegistry;
    schemas: Map<string, { item: unknown }>;
    hooks: Map<string, Hook>;
    profiles?: Record<string, ProfileConfig> | undefined;
  }) {
    this.#schemas = new CacheMap(schemas.entries(), (id, schema) => {
      return new SchemaGraph(id, typeset).compile(schema.item);
    });
    this.#hooks = hooks;
    this.#explicit_profiles = profiles || {};
  }

  static from ({ types, schemas, hooks, profiles }: {
    types: unknown[];
    schemas: Map<string, { item: unknown }>;
    hooks: Map<string, Hook>;
    profiles?: Record<string, ProfileConfig>;
  }): Project {
    return new Project({
      typeset: new TypeRegistry(types),
      schemas: EvilMap.from(schemas),
      hooks: EvilMap.from(hooks),
      profiles: profiles
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
    profile?: string;
    overrides?: Partial<ProfileConfig>;
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

    return new Engine({ schemas, hooks });
  }
}

export { Project };
