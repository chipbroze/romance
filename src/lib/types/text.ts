import type {
  TypeNode,
  Rom,
  Item,
  CompileApi,
  datasize
} from '../type-registry.js';

import type {
  ListModeConfig
} from './collections.js';

class TrieNode {
  children: Record<string, TrieNode> = {};
  token: string | null = null;
}

class Tokenizer {
  #trie: TrieNode
  constructor (tokens: string[]) {
    this.#trie = Tokenizer.#buildTrie(tokens);
  }
  static #buildTrie (tokens: string[]) {
    const root = new TrieNode();

    for (const token of tokens) {
      let curr = root;

      for (const char of token) {
        if (!Object.hasOwn(curr.children, char)) {
          curr.children[char] = new TrieNode();
        }
        curr = curr.children[char]!;
      }
      curr.token = token;
    }

    return root;
  }
  tokenize (text: string) {
    const trie = this.#trie;
    const len = text.length;
    if (len === 0) return [];

    // dp[i] = min tokens to encode text.slice(0, i)
    const dp = new Array<number>(len + 1).fill(Infinity);
    const parent_index = new Array<number | null>(len + 1).fill(null);
    const parent_token = new Array<string | null>(len + 1).fill(null);

    dp[0] = 0;

    for (let i = 0; i < len; i++) {
      if (dp[i] === Infinity) continue;
      let node = trie;

      for (let j = i; j < len; j++) {
        node = node.children[text[j]!]!;
        if (!node) break; // Early exit if no matching prefix

        if (node.token) {
          const next = j + 1;
          const count = dp[i]! + 1;

          if (count < dp[next]!) {
            dp[next] = count;
            parent_index[next] = i;
            parent_token[next] = node.token;
          }
        }
      }
    }

    if (dp[len] === Infinity) {
      const failure_index = dp.findLastIndex(Number.isFinite);
      throw new Error(
        `String contains unencodable sequence at or near index ${failure_index}`
      );
    }

    // Reconstruct token list from end to start
    const result = [];
    let curr = len;

    while (curr > 0) {
      result.push(parent_token[curr]!);
      curr = parent_index[curr]!;
    }

    return result.reverse();
  }
}

/* -------------------------------------------------------------------------- */
/*                                  TextStr                                   */
/* -------------------------------------------------------------------------- */

type TextStrArgs = {
  table: Record<string | number, string>;
  size: datasize;
  pad?: string | number;
} & ListModeConfig;

class TextStr {
  static readonly alias = 'string';
  static readonly kind = 'string';

  #pad: string | null;
  #length: number | null;
  #tokenizer: Tokenizer;
  #list: Item<'list'>;

  constructor({ table, pad, size, ...mode }: TextStrArgs, api: CompileApi) {
    this.#tokenizer = new Tokenizer(Object.values(table));
    this.#pad = pad != null ? table[pad]! : null;
    this.#length = 'length' in mode ? mode.length : null;
    this.#list = api.item('list', {
      item: api.item('enum', { values: table, size }),
      ...mode
    });
  }

  static isValidArgs (args: Record<string, unknown>): args is TextStrArgs {
    if (!isObj(args.table)) {
      throw new Error(`Expected table to be an object. Found ${args.table}`);
    }
    if (!Object.keys(args.table).every(k => (+k >= 0) && Number.isInteger(+k))) {
      throw new Error(`Expected table keys to be integers. Found ${args.table}`);
    }
    if (Object.values(args.table).length !== new Set(Object.values(args.table)).size) {
      throw new Error(`Expected unique table values. Found ${args.table}`);
    }
    if (args.pad != null) {
      if (typeof args.pad != 'number' || !Object.hasOwn(args.table, args.pad)) {
        throw new Error(`Pad must be a valid key in the table. Found ${args.pad}`);
      }
    }
    return true;
  }

  decode (rom: Rom) {
    const chars = this.#list.decode(rom) as string[];

    if (this.#pad != null) {
      let end = chars.length - 1;
      while (end >= 0 && chars[end] === this.#pad) {
        --end;
      }
      chars.splice(end + 1);
    }

    return chars.join('');
  }

  encode (string: string, rom: Rom): void {
    const chars = this.#tokenizer.tokenize(string);

    if (this.#pad != null && this.#length != null) {
      while (chars.length < this.#length) {
        chars.push(this.#pad);
      }
    }

    this.#list.encode(chars, rom);
  }

  format (string: string): string {
    return string;
  }

  parse (string: string): string {
    return string;
  }
}

/* -------------------------------------------------------------------------- */
/*                                 TextScript                                 */
/* -------------------------------------------------------------------------- */

interface TextScriptOpSpec {
  code: string | number;
  item: TypeNode;
}

type TextScriptArgs = {
  ops: Record<string, TextScriptOpSpec>;
  table: Record<string | number, string>;
  size: datasize;
  end: string;
} & ListModeConfig;

type ScriptItem = {
  name: string,
  value: unknown
};

class TextScript {
  static readonly alias = 'text_script';
  static readonly command_regex = /\[.*?\]|[^[]+/g;
  static readonly #text_name = '__text__';

  readonly #script: Item<'script'>;
  readonly #number_ops: Set<string>;

  constructor ({ size='byte', end, table, ops }: TextScriptArgs, api: CompileApi) {
    this.#script = api.item('script', {
      control: api.item('uint', { size }),
      options: {
        [TextScript.#text_name]: {
          match: Object.keys(table).map(Number),
          item: api.item('string', {
            table,
            size,
            end_at: (n: number) => !(n in table)
          })
        },
        ...ops
      },
      eol: { name: end, value: void 0 }
    });

    this.#number_ops = new Set(Object.keys(ops).filter(key => {
      return ops[key]!.item.kind === 'number';
    }));
  }

  static isValidArgs (args: Record<string, unknown>): args is TextScriptArgs {
    if (!isObj(args.ops)) {
      throw new Error(`Expected ops to be Record type. Found ${args.ops}`);
    }
    if (!isObj(args.table)) {
      throw new Error(`Expected table to be Record type. Found ${args.table}`);
    };
    if (TextScript.#text_name in args.ops) {
      throw new Error(`Cannot name TextScript op "${TextScript.#text_name}"`);
    }
    for (const str of Object.values(args.table)) {
      if (typeof str !== 'string') {
        throw new Error(`Table values must be strings. Found ${str}`);
      }
      if (/[[\]]/.test(str)) {
        throw new Error(`Cannot include square brackets in table strings`);
      }
    }
    for (const op of Object.values(args.ops)) {
      if (!isObj(op) || !isObj(op.item)) {
        throw new Error(`Expected op items to be Records. Found ${op}`);
      }
      const kind = op.item.kind;
      if (kind !== 'number' && kind !== 'string' && kind !== 'void') {
        throw new Error(`Unexpected op item kind: ${kind}`);
      }
    }
    return true;
  }

  decode (rom: Rom): ScriptItem[] {
    return this.#script.decode(rom);
  }
  encode (data: ScriptItem[], rom: Rom): void {
    this.#script.encode(data, rom);
  }
  parse (text: string): ScriptItem[] {
    const tokens = text.match(TextScript.command_regex) || [];

    return this.#script.parse(tokens.map(token => {
      if (token[0] !== '[') {
        return { [TextScript.#text_name]: token };
      } else {
        const [op, str] = token.slice(1, -1).split(':');
        const arg = this.#number_ops.has(op!) ? +str! : str;
        return { [op!]: arg };
      }
    })) as ScriptItem[];
  }

  format (list: ScriptItem[]): string {
    const formatted = this.#script.format(list) as Record<string, unknown>[];

    return formatted.map(item => {
      const [name, value] = Object.entries(item)[0]!;
      return (name === TextScript.#text_name ? value as string
        : value == null ? `[${name}]`
        : `[${name}:${value}]`
      );
    }).join('');
  }
}

function isObj (obj: unknown): obj is Record<string, unknown> {
  return obj != null && typeof obj === 'object';
}

export {
  TextStr,
  TextScript
};
