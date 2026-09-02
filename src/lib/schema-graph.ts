/* SchemaGraph */
import { clone, transform } from './transform.js';
import { hex } from './types/utils.js';
import { EvilMap } from './map-utils.js';
import { TypeNode } from './type-registry.js';
import type { Rom } from './rom.js';
import type {
  RomanceType,
  RomanceTypeInstance,
  InputObjOf,
  DataTypeOf,
  ReadableOf,
  TypeRegistry,
  SessionApi,
  CompileApi,
  RuntimeApi
} from './type-registry.js';

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
  #typeset: TypeRegistry;
  #runtime: GraphRuntime | null;
  id: string;
  readonly compile_api: CompileApi

  constructor (id: string, typeset: TypeRegistry) {
    this.id = id;
    this.#typeset = typeset;
    this.#tree = null;
    this.#runtime = null;

    this.compile_api = {
      item: this.#item.bind(this)
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
    const Type = this.#getType(type);
    const normalized_args = Type.normalizeArgs?.(args) ?? args;
    return this.#node(Type, normalized_args, name);
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
    const Type = this.#getType(type);

    return this.#node(Type, args, name).build(this.compile_api);
  }

  #getType (type: string): RomanceType {
    if (!this.#typeset.has(type)) {
      throw new Error(`Invalid or unregistered type identifier: ${type}`);
    }

    return this.#typeset.get(type);
  }

  #node <T extends RomanceType> (
    Type: T,
    args: Dict,
    name?: string
  ) {
    return new SchemaNode<T>({ 
      name: name || '',
      Type,
      args,
      root: this
    });
  }
}

function validateArgs <T extends RomanceType> (
  Type: T,
  args: Dict
): InputObjOf<T> {
  if (Type.isValidArgs) {
    if (!Type.isValidArgs(args)) {
      throw new Error(`Invalid args for type ${Type}: ${args}`);
    }
    return args;
  } else {
    return args as InputObjOf<T>;
  }
}

class SchemaNode <Type extends RomanceType=RomanceType>
  extends TypeNode<DataTypeOf<Type>, ReadableOf<Type>>
  implements StackNode
{
  #name: string;
  #Type: Type;
  #args: Dict;
  #root: SchemaGraph;
  #item: RomanceTypeInstance<DataTypeOf<Type>, ReadableOf<Type>> | null;

  constructor ({ name, Type, args, root }: {
    name: string,
    Type: Type,
    args: InputObjOf<Type>,
    root: SchemaGraph
  }) {
    super();
    this.#name = name;
    this.#Type = Type;
    this.#args = args;
    this.#root = root;
    this.#item = null;
  }

  build (compile_api: CompileApi) {
    if (!this.#item) {
      const args = validateArgs(this.#Type, this.#args);
      this.#item = new this.#Type(args, compile_api);
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
    // TODO: Figure out if this "as unknown" is necessary
    return this.#root.run(this as unknown as SchemaNode<Type>, func)
  }

  get name () {
    return this.#name;
  }
  get type () {
    return this.#Type.alias;
  }
  get kind () {
    return this.#Type.kind;
  }

  decode (rom: Rom): DataTypeOf<Type> {
    return this.#run((api: RuntimeApi) => {
      api.trace('offset', hex(rom.offset(), 'sword'));
      return this.#item!.decode(rom, api);
    });
  }
  encode (value: DataTypeOf<Type>, rom: Rom): void {
    return this.#run((api: RuntimeApi) => {
      api.trace('offset', hex(rom.offset(), 'sword'));
      return this.#item!.encode(value, rom, api)
    });
  }
  format (data: DataTypeOf<Type>): ReadableOf<Type> {
    return this.#run((api: RuntimeApi) => {
      return this.#item!.format(data, api);
    });
  }
  parse (data: ReadableOf<Type>): DataTypeOf<Type> {
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
