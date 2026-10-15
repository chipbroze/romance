/* SchemaGraph */
import { clone, transform } from '../utils/transform.js';
import { hex } from '../codecs/helpers.js';
import { EvilMap } from '../utils/map-utils.js';
import { CodecNode } from './codec-registry.js';
import './codecs.js'; // Ensure types are registered
import type { Rom } from './rom.js';
import type {
  RomanceCodec,
  CodecInstance,
  InputOf,
  DataOf,
  FormattedOf,
  CodecRegistry,
  SessionApi,
  CompileApi,
  RuntimeApi
} from './codec-registry.js';

const transform_target = Symbol('transform_target');

type Dict = Record<string, unknown>;

interface StackNode {
  name: string;
  type: string;
}

interface StackFrame {
  node: StackNode;
  notes: Dict;
}

class GraphRuntime {
  #stack: StackFrame[];
  #state: Map<StackNode, unknown>;
  api: RuntimeApi;

  constructor (schema_graph: SchemaGraph, session_api: SessionApi) {
    this.#stack = []; 
    this.#state = new Map();
    this.api = {
      item: schema_graph.compile_api.item,
      trace: this.#trace.bind(this),
      scratch: this.#scratch.bind(this),
      getLib: session_api.getLib,
      setLib: session_api.setLib,
      fetch: session_api.fetch,
      transform: session_api.transform
    };
  }

  run <RV> (
    node: SchemaNode,
    fn: (api: RuntimeApi) => RV
  ) {
    this.#stack.push({ node, notes: {} });
    const result = fn(this.api);
    this.#stack.pop();
    return result;
  }

  get #current () {
    return this.#stack[this.#stack.length - 1];
  }

  #trace (key: string, value: unknown) {
    const frame = this.#current;

    if (frame) {
      frame.notes[key] = value;
    }
  }

  #scratch <T> (create: () => T) {
    const node = this.#current?.node;
    if (node) {
      if (!this.#state.has(node)) {
        this.#state.set(node, create());
      }
      return this.#state.get(node) as T;
    }
    throw new Error('Attempted scratch call from non-node');
  }

  formatTrace (message: string) {
    const trace = this.#stack.map(({ node, notes }) => {
      const fields = Object.entries(notes).map(
        ([k, v]) => `${k}=${v}`
      ).join(', ');
      const note_str = fields ? ` (${fields})` : '';

      return `  ${node.name} [${node.type}]${note_str}`;
    }).join('\n');

    return `${message}\n\nTrace:\n${trace}`;
  }
}

interface NodeSpec {
  [key: string]: unknown;
  $type: string;
  $name?: string;
}
interface NodeMeta {
  type: string,
  name?: string
}
function isNodeMeta (meta: unknown): meta is NodeMeta {
  return Boolean(
    meta != null &&
    typeof meta === 'object' &&
    'type' in meta &&
    typeof meta.type === 'string'
  );
}
function isRecord (obj: unknown): obj is Dict {
  return obj != null && typeof obj === 'object';
}

class SchemaGraph {
  #tree: SchemaNode | null;
  #codex: CodecRegistry;
  #runtime: GraphRuntime | null;
  id: string;
  readonly compile_api: CompileApi

  constructor (id: string, codex: CodecRegistry) {
    this.id = id;
    this.#codex = codex;
    this.#tree = null;
    this.#runtime = null;

    this.compile_api = {
      // We cast here because our SchemaNodes types are erased.
      // The CompileApi contract itself handles type checking
      item: this.#item.bind(this) as CompileApi['item']
    }
  }

  #isNodeSpec (value: unknown): value is NodeSpec {
    return Boolean(
      value &&
      typeof value === 'object' &&
      '$type' in value &&
      typeof value.$type === 'string'
    );
  }

  compile (schema: unknown) {
    const seen = new EvilMap<NodeSpec, SchemaNode>();
    const look = new EvilMap<Dict, SchemaNode>();
    const root = clone([schema]);

    transform(root, (_, value: unknown) => {
      // Ensures duplicate (and recursive) items are only processed once
      if (this.#isNodeSpec(value)) {
        if (seen.has(value)) {
          value = seen.get(value);
        } else {
          const node = this.#compileNode(value);
          const args = node[transform_target] as Dict;
          seen.set(value, node);
          look.set(args, node);
          value = args;
        }
      }
      return value;
    }, (_, value: unknown) => {
      return (look.has(value as Dict)
        ? look.get(value as Dict).build(this.compile_api)
        : value
      );
    });

    if (root[0] instanceof SchemaNode) {
      this.#tree = root[0];
    }

    return this;
  }

  bind (session_api: SessionApi) {
    if (this.#runtime != null) {
      throw new Error('Schema already running inside a session');
    }

    this.#runtime = new GraphRuntime(this, session_api);
    return this;
  }

  unbind () {
    this.#runtime = null;
  }

  execute <T> (
    session_api: SessionApi,
    fn: (root: SchemaNode) => T
  ): T {
    this.bind(session_api);

    try {
      const node = this.#tree!;
      return fn(node);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const formatted = this.#runtime!.formatTrace(message);
      throw new Error(formatted, { cause: e });
    } finally {
      this.unbind();
    }
  }

  run <RV> (
    node: SchemaNode,
    fn: (api: RuntimeApi) => RV
  ) {
    return this.#runtime!.run(node, fn);
  }

  // Runtime schema normalization, limited type safety
  #compileNode (spec: NodeSpec): SchemaNode {
    const { $type: type, $name: name = '', ...args } = spec;
    const Codec = this.#getCodec(type);
    const normalized_args = Codec.normalizeArgs?.(args) ?? args;
    return this.#node(Codec, normalized_args, name);
  }

  // Compile-time type checking in type definitions
  #item (
    meta: unknown,
    args: unknown = {}
  ): SchemaNode {
    if (typeof meta === 'string') {
      meta = { type: meta };
    }
    if (!isNodeMeta(meta)) {
      throw new Error(`Item type is not a string: ${meta}`);
    }
    if (!isRecord(args)) {
      throw new Error('Item args must be an object');
    }
    const { type, name } = meta;
    const Codec = this.#getCodec(type);

    return this.#node(Codec, args, name).build(this.compile_api);
  }

  #getCodec (type: string): RomanceCodec {
    if (!this.#codex.has(type)) {
      throw new Error(`Invalid or unregistered codec identifier: ${type}`);
    }

    return this.#codex.get(type) as RomanceCodec;
  }

  #node <
    Codec extends RomanceCodec,
    Args extends InputOf<Codec>
  > (
    Codec: Codec,
    args: Args,
    name?: string
  ) {
    return new SchemaNode<Codec>({ 
      name: name || '',
      Codec,
      args,
      root: this
    });
  }
}

function validateArgs (
  Codec: RomanceCodec,
  args: Dict
): Dict {
  if (Codec.isValidArgs && !Codec.isValidArgs(args)) {
    throw new Error(`Invalid args for type ${Codec}: ${args}`);
  }
  return args;
}

class SchemaNode <
  Codec extends RomanceCodec = RomanceCodec,
  Args extends InputOf<Codec> = InputOf<Codec>
>
  extends CodecNode<DataOf<Codec, Args>, FormattedOf<Codec, Args>>
  implements StackNode
{
  #name: string;
  #Codec: Codec;
  #args: Dict;
  #root: SchemaGraph;
  #item: CodecInstance<DataOf<Codec, Args>, FormattedOf<Codec, Args>> | null;

  constructor ({ name, Codec, args, root }: {
    name: string,
    Codec: Codec,
    args: Args,
    root: SchemaGraph
  }) {
    super();
    this.#name = name;
    this.#Codec = Codec;
    this.#args = args;
    this.#root = root;
    this.#item = null;
  }

  build (compile_api: CompileApi) {
    if (!this.#item) {
      const args = validateArgs(this.#Codec, this.#args);
      this.#item = this.#Codec.construct(args, compile_api) as (
        CodecInstance<DataOf<Codec, Args>, FormattedOf<Codec, Args>>
      );
    }
    return this;
  }

  get [transform_target] () {
    return this.#args;
  }

  [Symbol.for('nodejs.util.inspect.custom')] () {
    return `$${this.#name}{${this.type}}`;
  }

  #run <RV> (func: (api: RuntimeApi) => RV) {
    return this.#root.run(this, func)
  }

  get name () {
    return this.#name;
  }
  get type () {
    return this.#Codec.alias;
  }
  get kind () {
    return this.#Codec.kind;
  }

  decode (rom: Rom): DataOf<Codec, Args> {
    return this.#run((api: RuntimeApi) => {
      api.trace('offset', hex(rom.offset(), 'sword'));
      return this.#item!.decode(rom, api);
    });
  }
  encode (value: DataOf<Codec, Args>, rom: Rom): void {
    return this.#run((api: RuntimeApi) => {
      api.trace('offset', hex(rom.offset(), 'sword'));
      return this.#item!.encode(value, rom, api)
    });
  }
  format (data: DataOf<Codec, Args>): FormattedOf<Codec, Args> {
    return this.#run((api: RuntimeApi) => {
      return this.#item!.format(data, api);
    });
  }
  parse (data: FormattedOf<Codec, Args>): DataOf<Codec, Args> {
    return this.#run((api: RuntimeApi) => {
      return this.#item!.parse(data, api);
    });
  }
}

export {
  SchemaGraph,
  GraphRuntime,
  SchemaNode
};

export type {
  CompileApi,
  RuntimeApi
};
