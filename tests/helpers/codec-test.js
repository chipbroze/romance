import assert from 'node:assert';
import '#root/core/codecs.js';
import { Rom } from '#root/core/rom.js';
import { SchemaGraph } from '#root/core/schema-graph.js';
import { CodecRegistry } from '#root/core/codec-registry.js';

function coalesce (...arrays) {
  const sparse = arrays.map(array => {
    const clone = array.slice();
    for (let i = 0; i < clone.length; ++i) {
      if (clone[i] == null) {
        delete clone[i];
      }
    }
    return clone;
  });

  return Object.assign(...sparse);
}

function getRom (buffer) {
  return new Rom(buffer, {
    headered_size: Infinity,
    mapTo (offset) {
      return offset;
    },
    mapFrom (index) {
      return index;
    },
    checksum (_buffer) {
      return 0;
    }
  });
}

class CodecTester {
  #graph; #session_api;

  constructor (session_api = {}) {
    const registry = new CodecRegistry();
    const api = {
      getLib: session_api.getLib?.bind(session_api),
      setLib: session_api.setLib?.bind(session_api),
      fetch: session_api.fetch?.bind(session_api),
      transform: session_api.transform?.bind(session_api)
    };

    this.#session_api = api;
    this.#graph = new SchemaGraph('test', registry);
    this.#reset();
  }

  get api () {
    return this.#graph.compile_api;
  }

  #reset () {
    this.#graph.unbind();
    this.#graph.bind(this.#session_api);
  }

  /**
   * context: Optional uint array with additional layer of binary data
              required for accurate decode, such as for lookaheads.
   */
  assertCodec (codec, config) {
    const {
      uints,
      data,
      readable=data,
      context=null
    } = config;
  
    const full = context ? coalesce(uints, context) : uints;
    const reset = this.#reset.bind(this);
  
    verifyDecode(codec, { uints: full, data });
    reset();
    verifyEncode(codec, { uints, data });
    reset();
    verifyRoundtripDecode(codec, { uints: full, context }, reset);
    reset();
    verifyRoundtripEncode(codec, { uints, data, context }, reset);
    reset();
    verifyFormat(codec, { data, readable });
    reset();
    verifyParse(codec, { data, readable });
    reset();
    verifyRoundtripFormat(codec, { data }, reset);
    reset();
    verifyRoundtripParse(codec, { readable }, reset);
    reset();
  }
}

function verifyDecode (codec, { uints, data }) {
  const buffer = new Uint8Array(uints);
  const rom = getRom(buffer);
  assert.deepStrictEqual(codec.decode(rom), data,
    'Decode accuracy failed'
  );
}

function verifyEncode (codec, { uints, data }) {
  const buffer = new Uint8Array(uints.length);
  const rom = getRom(buffer);
  codec.encode(data, rom);
  assert.deepStrictEqual(buffer, new Uint8Array(uints),
    'Encode accuracy failed'
  );
}

function verifyRoundtripDecode (codec, { uints, context }, reset) {
  const buffer = new Uint8Array(uints);
  const rom = getRom(buffer);
  const decoded = codec.decode(rom);
  reset();
  const reencoded = new Uint8Array(context || uints.length);
  const reencode_rom = getRom(reencoded);
  codec.encode(decoded, reencode_rom);
  assert.deepStrictEqual(reencoded, buffer,
    'Roundtrip decode/encode failed'
  );
}

function verifyRoundtripEncode (codec, { uints, data, context }, reset) {
  const rom = getRom(new Uint8Array(context || uints.length));
  codec.encode(data, rom);
  reset();
  rom.offset(0);
  const decoded = codec.decode(rom);
  assert.deepStrictEqual(decoded, data,
    'Roundtrip DataToBinary symmetry failed'
  );
}

function verifyFormat (codec, { data, readable }) {
  assert.deepStrictEqual(codec.format(data), readable,
    'Format accuracy failed'
  );
}

function verifyParse (codec, { data, readable }) {
  assert.deepStrictEqual(codec.parse(readable), data,
    'Parse accuracy failed'
  );
}

function verifyRoundtripFormat (codec, { data }, reset) {
  const formatted = codec.format(data);
  reset();
  const parsed = codec.parse(formatted);
  assert.deepStrictEqual(parsed, data,
    'Roundtrip format/parse symmetry failed'
  );
}

function verifyRoundtripParse (codec, { readable }, reset) {
  const parsed = codec.parse(readable);
  reset();
  const formatted = codec.format(parsed);
  assert.deepStrictEqual(formatted, readable,
    'Roundtrip parse/format symmetry failed'
  );
}

function assertError (codec, invalidData) {
  assert.throws(() => {
    codec.encode(invalidData, getRom(new Uint8Array([0])));
  }, 'Expected error was not thrown');
}

export {
  CodecTester,
  verifyDecode,
  verifyEncode,
  verifyFormat,
  verifyParse,
  verifyRoundtripDecode,
  verifyRoundtripEncode,
  verifyRoundtripFormat,
  verifyRoundtripParse,
  assertError
};
