
import * as v from './valibot.js';

import {
  Lookup,
  type Dict
} from './helpers.js';

import {
  type Rom,
  type datasize,
  CodecKit
} from '../codec-kit.js';

import {
  type ListModeSpec,
  List,
  list_mode_schema
} from './collections.js';

import type { Enum, Uint } from './scalars.js';
import {
  type Script,
  type ForkOptions,
  type ForkDataFor,
  Fork
} from './ops.js';

declare module '../codec-kit.js' {
  interface MasterCodecRegistry {
    string: typeof TextStr;
    text_script: typeof TextScript;
  }
}

class TrieNode {
  children: Dict<TrieNode> = {};
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

type NumDict <T> = Record<number, T>;
type TextStrArgs <
  Table extends NumDict<string> = NumDict<string>
> = {
  table: Table;
  size: datasize;
  pad?: keyof Table;
  mode: ListModeSpec<string>;
};

const text_str_schema = v.object({
  table: v.num_dict(v.string()),
  size: v.datasize(),
  pad: v.optional(v.any()),
  mode: list_mode_schema
});

const TextStr = CodecKit.from<{
  list: typeof List;
  enum: typeof Enum;
}>().run(Kit => Kit.simple({
  alias: 'string',
  kind: 'string',
  normalizeArgs (args) {
    const { table, size, pad, ...rest } = args;
    const { mode } = List.normalizeArgs!(rest);
    const pad_obj = pad != null ? { pad } : {};
    return { table, size, ...(pad_obj), mode };
  },
  isValidArgs (args: Dict): args is TextStrArgs {
    v.assert(text_str_schema, args);
    if (Object.values(args.table).length !== new Set(Object.values(args.table)).size) {
      throw new Error(`Expected unique table values. Found ${args.table}`);
    }
    if (args.pad != null) {
      if (typeof args.pad != 'number' || !Object.hasOwn(args.table, args.pad)) {
        throw new Error(`Pad must be a valid key in the table. Found ${args.pad}`);
      }
    }
    return true;
  },
  construct <
    Table extends NumDict<string>
  > (
    { table, pad, size, mode }: TextStrArgs<Table>,
    api: typeof Kit.Api
  ) {
    const $tokenizer = new Tokenizer(Object.values(table));
    const $pad = pad != null ? table[pad] as string : null;
    const $length = mode.key === 'length' ? mode.arg as number : null;
    const $list = api.item('list', {
      item: api.item('enum', { values: table, size }),
      mode
    });

    return Kit.instance<string, string>({
      decode: (rom) => {
        const chars = $list.decode(rom);

        if ($pad != null) {
          let end = chars.length - 1;
          while (end >= 0 && chars[end] === $pad) {
            --end;
          }
          chars.splice(end + 1);
        }

        return chars.join('');
      },
      encode: (string, rom) => {
        const chars = $tokenizer.tokenize(string);

        if ($pad != null && $length != null) {
          while (chars.length < $length) {
            chars.push($pad);
          }
        }

        $list.encode(chars, rom);
      },
      format: (string) => string,
      parse: (string) => string
    });
  }
}));

/* -------------------------------------------------------------------------- */
/*                                 TextScript                                 */
/* -------------------------------------------------------------------------- */

type TextScriptArgs <
  Table extends NumDict<string> = NumDict<string>,
  Ops extends ForkOptions<number> = ForkOptions<number>
> = {
  table: Table,
  size: datasize;
  ops: Ops;
  mode: ListModeSpec<ForkDataFor<number, Ops>>
};

const text_script_command_regex = /\[.*?\]|[^[]+/g;
const text_script_text_name = '__text__';

const text_script_schema = v.object({
  table: v.num_dict(v.string()),
  size: v.optional(v.datasize()),
  mode: list_mode_schema,
  ops: v.array(
    v.object({
      name: v.string(),
      item: v.node(),
      match: v.array(v.any())
    })
  )
});

const TextScript = CodecKit.from<{
  uint: typeof Uint;
  string: typeof TextStr;
  script: typeof Script;
}>().run(Kit => Kit.composite({
  alias: 'text_script',
  kind: 'array',
  rule: 'custom', // TODO NEEDS NEW RULE
  normalizeArgs (args) {
    const { options } = Fork.normalizeArgs!({ options: args.ops });
    return { ...args, ops: options };
  },
  isValidArgs (args: Dict): args is TextScriptArgs {
    v.assert(text_script_schema, args);
    for (const str of Object.values(args.table)) {
      if (/[[\]]/.test(str)) {
        throw new Error(`Cannot include square brackets in table strings`);
      }
    }
    for (const op of args.ops) {
      const kind = op.item.kind;
      if (kind !== 'number' && kind !== 'string' && kind !== 'void') {
        throw new Error(`Unexpected op item kind: ${kind}`);
      }
      if (op.name === text_script_text_name) {
        throw new Error(`Cannot name TextScript op "${text_script_text_name}"`);
      }
    }
    return true;
  },
  construct <
    Table extends NumDict<string>,
    const Ops extends ForkOptions<number>
  > (
    { size='byte', mode, table, ops }: TextScriptArgs<Table, Ops>,
    api: typeof Kit.Api
  ) {
    const $lookup = Lookup.fromNumRecord(table);
    const $script = api.item('script', {
      mode,
      control: api.item('uint', { size }),
      options: [{
        name: text_script_text_name,
        match: Object.keys(table).map(Number),
        item: api.item('string', {
          table,
          size,
          mode: {
            key: 'until',
            arg: (peek_rom: Rom) => {
              const next = peek_rom.read(size);
              return !$lookup.hasKey(next);
            }
          }
        })
      }, ...ops],
    });

    const $number_ops = new Set(ops.filter(op => {
      return op.item.kind === 'number';
    }).map(op => op.name));

    return Kit.instance<typeof $script['<Data>'], string>({
      decode: (rom) => {
        return $script.decode(rom);
      },
      encode: (data, rom) => {
        $script.encode(data, rom);
      },
      format: (list) => {
        const formatted = $script.format(list);

        return formatted.map(item => {
          const [name, value] = Object.entries(item)[0]!;
          return (name === text_script_text_name ? value as string
            : value == null ? `[${name}]`
            : `[${name}:${value}]`
          );
        }).join('');
      },
      parse: (text) => {
        const tokens = text.match(text_script_command_regex) || [];

        return $script.parse(tokens.map(token => {
          if (token[0] !== '[') {
            return { [text_script_text_name]: token };
          } else {
            const [op, str] = token.slice(1, -1).split(':');
            const arg = $number_ops.has(op!) ? +str! : str;
            return { [op!]: arg };
          }
        }) as typeof $script['<Formatted>']);
      }
    });
  }
}));

export {
  TextStr,
  TextScript
};
