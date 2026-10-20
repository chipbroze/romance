
import type {
  Dict
} from '../utils/types.js';

import type {
  CodecRegistry,
  RomanceCodec,
} from './codec-types.js';

import * as codecs from '../codecs/index.js';

type CodecAlias = keyof CodecRegistry;

const registered_codecs = new Map<string, RomanceCodec>();

// Register all built-in codecs automatically
for (const codec of Object.values(codecs)) {
  if (codec.alias) {
    registerCodecs(codec as unknown);
  }
}

// Runtime (JS) Codec Registration
function registerCodecs (...codecs: unknown[]) {
  for (const codec of codecs) {
    assertRomanceCodec(codec);
    if (!registered_codecs.has(codec.alias)) {
      registered_codecs.set(codec.alias, codec);
    }
  }
}

class Codex {
  #codecs: Map<string, RomanceCodec> = new Map();

  constructor (extra_codecs: unknown[] = []) {
    const all_codecs = [
      ...registered_codecs.values(),
      ...extra_codecs
    ];
    for (const romance_codec of all_codecs) {
      assertRomanceCodec(romance_codec);
      this.#codecs.set(romance_codec.alias, romance_codec);
    }
  }

  has (alias: unknown): alias is CodecAlias {
    return typeof alias === 'string' && this.#codecs.has(alias);
  }

  get <T extends CodecAlias> (alias: T): CodecRegistry[T] {
    return this.#codecs.get(alias) as CodecRegistry[T];
  }
}

function assertRomanceCodec (
  unknown: unknown
): asserts unknown is RomanceCodec {
  if (!unknown || typeof unknown !== 'object') {
    throw new Error('Invalid Codec: Expected object definition');
  }
  if (typeof (unknown as Dict).alias !== 'string') {
    throw new Error('Invalid Codec: Expected "alias" to be type: string');
  }
  if (typeof (unknown as Dict).construct !== 'function') {
    const alias = (unknown as Dict).alias;
    throw new Error(`Invalid Codec "${alias}": Missing "construct" function`);
  }
  // TODO: Validate decode/encode/format/parse methods
}

export {
  Codex,
  registerCodecs
};
