import assert from 'node:assert';
import { Rom } from '#root/lib/rom.js';
import { SchemaGraph } from '#root/lib/schema-graph.js';
import { TypeRegistry } from '#root/lib/type-registry.js';

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

class TypeTester {
  #graph; #session_api;

  constructor (session_api = {}) {
    const registry = new TypeRegistry();
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
  assertType (type, config) {
    const {
      uints,
      data,
      readable=data,
      context=null
    } = config;
  
    const full = context ? coalesce(uints, context) : uints;
    const reset = this.#reset.bind(this);
  
    verifyDecode(type, { uints: full, data });
    reset();
    verifyEncode(type, { uints, data });
    reset();
    verifyRoundtripDecode(type, { uints: full, context }, reset);
    reset();
    verifyRoundtripEncode(type, { uints, data, context }, reset);
    reset();
    verifyFormat(type, { data, readable });
    reset();
    verifyParse(type, { data, readable });
    reset();
    verifyRoundtripFormat(type, { data }, reset);
    reset();
    verifyRoundtripParse(type, { readable }, reset);
    reset();
  }
}

function verifyDecode (type, { uints, data }) {
  const buffer = new Uint8Array(uints);
  const rom = getRom(buffer);
  assert.deepStrictEqual(type.decode(rom), data,
    'Decode accuracy failed'
  );
}

function verifyEncode (type, { uints, data }) {
  const buffer = new Uint8Array(uints.length);
  const rom = getRom(buffer);
  type.encode(data, rom);
  assert.deepStrictEqual(buffer, new Uint8Array(uints),
    'Encode accuracy failed'
  );
}

function verifyRoundtripDecode (type, { uints, context }, reset) {
  const buffer = new Uint8Array(uints);
  const rom = getRom(buffer);
  const decoded = type.decode(rom);
  reset();
  const reencoded = new Uint8Array(context || uints.length);
  const reencode_rom = getRom(reencoded);
  type.encode(decoded, reencode_rom);
  assert.deepStrictEqual(reencoded, buffer,
    'Roundtrip decode/encode failed'
  );
}

function verifyRoundtripEncode (type, { uints, data, context }, reset) {
  const rom = getRom(new Uint8Array(context || uints.length));
  type.encode(data, rom);
  reset();
  rom.offset(0);
  const decoded = type.decode(rom);
  assert.deepStrictEqual(decoded, data,
    'Roundtrip DataToBinary symmetry failed'
  );
}

function verifyFormat (type, { data, readable }) {
  assert.deepStrictEqual(type.format(data), readable,
    'Format accuracy failed'
  );
}

function verifyParse (type, { data, readable }) {
  assert.deepStrictEqual(type.parse(readable), data,
    'Parse accuracy failed'
  );
}

function verifyRoundtripFormat (type, { data }, reset) {
  const formatted = type.format(data);
  reset();
  const parsed = type.parse(formatted);
  assert.deepStrictEqual(parsed, data,
    'Roundtrip format/parse symmetry failed'
  );
}

function verifyRoundtripParse (type, { readable }, reset) {
  const parsed = type.parse(readable);
  reset();
  const formatted = type.format(parsed);
  assert.deepStrictEqual(formatted, readable,
    'Roundtrip parse/format symmetry failed'
  );
}

function assertError (type, invalidData) {
  assert.throws(() => {
    type.encode(invalidData, getRom(new Uint8Array([0])));
  }, 'Expected error was not thrown');
}

export {
  TypeTester,
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
