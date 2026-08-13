type key = string | number;
type node = Record<string, unknown> | Array<unknown>;

function isRecord (obj: unknown): obj is Record<string, unknown> {
  return obj != null && typeof obj === 'object' && !Array.isArray(obj);
}

function transform (
  node: unknown,
  capture?: (key: key, value: unknown, parent: node) => unknown,
  bubble?: (key: key, value: unknown, parent: node) => unknown
): void {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; ++i) {
      if (capture) {
        node[i] = capture(i, node[i], node);
      }

      transform(node[i], capture, bubble);

      if (bubble) {
        node[i] = bubble(i, node[i], node);
      }
    }
  } else if (isRecord(node)) {
    for (const key in node) {
      if (capture) {
        node[key] = capture(key, node[key], node);
      }

      transform(node[key], capture, bubble);

      if (bubble) {
        node[key] = bubble(key, node[key], node);
      }
    }
  }
}

function clone <t> (value: t): t {
  // Check for null or undefined
  if (value == null) {
    return value;
  }

  // Handle Date
  if (value instanceof Date) {
    return new Date(value.getTime()) as t;
  }

  // Handle Array
  if (Array.isArray(value)) {
    return value.map(clone) as t;
  }

  // Handle Primitive Types (string, number, boolean, symbol, bigint)
  if (!isRecord(value)) {
    return value;
  }

  // Handle basic Objects
  if (value.constructor === Object || value.constructor == null) {
    const obj_clone: Record<string, unknown> = {};
    for (const key in value) {
      if (own(value, key)) {
        obj_clone[key] = clone(value[key]);
      }
    }
    return obj_clone as t;
  }

  throw new Error(`Cannot clone ${value} (${value.constructor?.name ?? 'unknown'})`);
}

function own (obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export {
  transform,
  clone
};
