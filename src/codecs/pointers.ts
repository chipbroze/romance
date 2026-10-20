import * as v from './valibot.js';
import { asNode, passthrough } from './helpers.js';
import { type Dict } from '../utils/types.js';

import {
  CodecKit,
  type Datasize,
  type CodecNode,
} from '../codec-kit.js';

import type { Uint, HexInt } from './scalars.js';
import type { List } from './collections.js';
import type { Range } from './ops.js';

declare module '../codec-kit.js' {
  interface CodecRegistry {
    dereference: typeof Dereference;
    list_index: typeof ListIndex;
    pointer: typeof Pointer;
    pointer_index: typeof PointerIndex;
    pointer_table: typeof PointerTable;
  }
}

type DereferenceArgs <
  Item extends CodecNode = CodecNode,
  Ref extends CodecNode = CodecNode,
> = {
  item: Item;
  reference: Ref;
  org: number;
  warn?: number;
  toReference: (num: number) => Ref['<Data>'];
  // Use method syntax to bypass contravariance. This breaks type safety.
  toAddress (x: Ref['<Data>']): number;
};

const dereference_schema = v.object({
  item: v.node(),
  reference: v.node(),
  org: v.uint(),
  warn: v.nullish(v.uint()),
  toReference: v.function(),
  toAddress: v.function(),
});

const Dereference = CodecKit.composite({
  alias: 'dereference',
  kind: 'passthrough',
  rule: 'item', 
  isValidArgs (args: Dict): args is DereferenceArgs {
    v.assert(dereference_schema, args);
    return true;
  },
  construct <Item extends CodecNode, Ref extends CodecNode> (
    input: DereferenceArgs<Item, Ref>
  ) {
    const $item = asNode(input.item);
    const $reference = asNode(input.reference);
    const $org = input.org;
    const $warn = input.warn;
    const $toAddress = input.toAddress;
    const $toReference = input.toReference;

    return CodecKit.instance<Item['<Data>'], Item['<Formatted>']>({
      kind: $item.kind,
      decode: (rom) => {
        const address = $toAddress($reference.decode(rom));
        return rom.jsr({ start: address, end: $warn }, () => {
          return $item.decode(rom);
        });
      },
      encode: (data, rom, api) => {
        const progress = api.scratch(() => ({
          seen: new Map<string, number>(),
          frame: rom.frame({ start: $org, end: $warn })
        }));

        const key = JSON.stringify(data);
        if (!progress.seen.has(key)) {
          api.trace('index', progress.seen.size);
          rom.with(progress.frame, () => {
            const write_at = rom.offset();
            $item.encode(data, rom);
            progress.seen.set(key, write_at);
          });
        }

        const pointer = progress.seen.get(key)!;
        $reference.encode($toReference(pointer), rom);
      },
      format: (data) => $item.format(data),
      parse: (data) => $item.parse(data)
    });
  }
});

type ListIndexArgs <Item extends CodecNode = CodecNode> = {
  org: number;
  warn?: number;
  base?: number;
  chunk: number;
  item: Item;
  size?: Datasize;
};

const list_index_schema = v.object({
  item: v.node(),
  org: v.uint(),
  warn: v.nullish(v.uint()),
  base: v.optional(v.uint()),
  chunk: v.uint(),
  size: v.optional(v.datasize()),
});

const ListIndex = CodecKit.from<{
  uint: typeof Uint,
  dereference: typeof Dereference
}>().run(Kit => Kit.composite({
  alias: 'list_index',
  kind: 'array',
  rule: 'item',
  isValidArgs (args: Dict): args is ListIndexArgs {
    v.assert(list_index_schema, args);
    return true;
  },
  construct <Item extends CodecNode> (
    { org, warn, base, chunk, item, size }: ListIndexArgs<Item>,
    api: typeof Kit.Api
  ) {
    const $base = base ?? org;
    const $size = size ?? 'byte';
    const $warn = warn == null ? {} : { warn };
    const $node = api.item('dereference', {
      item,
      org,
      ...$warn,
      reference: api.item('uint', { size: $size }),
      toAddress: (index: number) => $base + (+index * chunk),
      toReference: (address: number) => (address - $base) / chunk
    });

    return passthrough($node);
  }
}));

type PointerArgs <
  Item extends CodecNode = CodecNode
> = Omit<ListIndexArgs<Item>, 'chunk'>;

const pointer_schema = v.object({
  org: v.uint(),
  warn: v.nullish(v.uint()),
  base: v.optional(v.uint()),
  item: v.node(),
  size: v.optional(v.datasize()),
});

const Pointer = CodecKit.from<{
  list_index: typeof ListIndex
}>().run(Kit => Kit.composite({
  alias: 'pointer',
  kind: 'passthrough',
  rule: 'item',
  isValidArgs (args: Dict): args is PointerArgs {
    v.assert(pointer_schema, args);
    return true;
  },
  construct <Item extends CodecNode> (
    args: PointerArgs<Item>,
    api: typeof Kit.Api
  ) {
    const $node = api.item('list_index', {
      ...args,
      size: args.size ?? 'word',
      chunk: 1
    });

    return passthrough($node);
  }
}));

type PointerIndexArgs <
  Item extends CodecNode = CodecNode
> = PointerArgs<Item> & {
  pointers_org: number;
  pointers_base?: number;
  length: number;
};

const pointer_index_schema = v.object({
  pointers_org: v.uint(),
  pointers_base: v.optional(v.uint()),
  length: v.uint(),
  org: v.uint(),
  warn: v.uint(),
  base: v.optional(v.uint()),
  item: v.node(),
  size: v.optional(v.datasize()),
});

const PointerIndex = CodecKit.from<{
  list_index: typeof ListIndex,
  pointer: typeof Pointer
}>().run(Kit => Kit.composite({
  alias: 'pointer_index',
  kind: 'passthrough',
  rule: 'item',
  isValidArgs (args: Dict): args is PointerIndexArgs {
    v.assert(pointer_index_schema, args);
    return true;
  },
  construct <Item extends CodecNode> (
    input: PointerIndexArgs<Item>,
    api: typeof Kit.Api
  ) {
    const {
      pointers_org,
      pointers_base,
      length,
      ...pointer_args
    } = input;

    const $base = pointers_base == null ? {} : { base: pointers_base };
    const $node = api.item('list_index', {
      item: api.item('pointer', pointer_args),
      org: pointers_org,
      warn: pointers_org + 2 * length,
      ...$base,
      chunk: 2
    });

    return passthrough($node);
  }
}));

type PointerTableArgs <Item extends CodecNode = CodecNode> = {
  item: Item;
  length: number;
  org: number;
  warn: number;
  wrap?: number;
  base?: number;
};

const pointer_table_schema = v.object({
  item: v.node(),
  length: v.uint(),
  org: v.uint(),
  warn: v.uint(),
  wrap: v.optional(v.uint()),
  base: v.optional(v.uint()),
});

const PointerTable = CodecKit.from<{
  list: typeof List,
  range: typeof Range,
  xint: typeof HexInt,
  uint: typeof Uint
}>().run(Kit => Kit.composite({
  alias: 'pointer_table',
  kind: 'array',
  rule: 'list',
  isValidArgs (args: Dict): args is PointerTableArgs {
    v.assert(pointer_table_schema, args);
    return true;
  },
  construct <Item extends CodecNode> (
    { item, length, org, warn, wrap, base }: PointerTableArgs<Item>,
    api: typeof Kit.Api
  ) {
    const $item = asNode(item);
    const $org = org;
    const $base = base ?? org;
    const $wrap = wrap;
    const $warn = warn;
    const $wrapper = ($wrap != null
      ? api.item('uint', { size: 'word' })
      : undefined
    );
    const $pointers = api.item('list', {
      item: api.item('xint', { size: 'word' }),
      mode: { key: 'length', arg: length }
    });

    return Kit.instance<Item['<Data>'][], Item['<Formatted>'][]>({
      decode: (rom, api) => {
        const seen = new Map();
        const wrap_at = $wrapper ? $wrapper.decode(rom) : Infinity;

        return $pointers.decode(rom).map((pointer, i) => {
          const offset = i >= wrap_at ? $wrap! : $base;
          const org = pointer + offset;

          if (!seen.has(org)) {
            const value = rom.jsr({ start: org, end: $warn }, () => {
              api.trace('index', i.toString());
              return $item.decode(rom);
            });
            seen.set(org, value);
          }

          return seen.get(org);
        });
      },
      encode: (list, rom, api) => {
        const pointers: number[] = [];
        const seen = new Map<string, number>();
        const frame = rom.frame({
          start: $org,
          end: $warn
        });
        const counter = $wrapper && api.item('range', {
          org: rom.offset(),
          item: $wrapper
        });

        if ($wrapper) {
          $wrapper.encode(0, rom);
        }

        let base = $base;
        let offset = $org;

        for (const item of list) {
          const key = JSON.stringify(item);

          if (!seen.has(key)) {
            if (counter && offset >= $wrap! && base === $base) {
              base = $wrap!;
              seen.clear();
              counter.encode(pointers.length, rom);
            }

            seen.set(key, offset - base);

            api.trace('index', pointers.length.toString());
            rom.with(frame, () => {
              $item.encode(item, rom);
              offset = rom.offset();
            });
          }

          pointers.push(seen.get(key)!);
        }

        let unused = $warn && $warn - offset;
        if (unused) {
          rom.jsr(offset, () => {
            while (unused!--) rom.write(0xFF, 'byte');
          });
        }

        return $pointers.encode(pointers, rom);
      },
      format: (data) => {
        return data.map(item => $item.format(item));
      },
      parse: (data) => {
        return data.map(item => $item.parse(item));
      }
    });
  }
}));

export {
  Dereference,
  ListIndex,
  Pointer,
  PointerIndex,
  PointerTable
};
