export { deepEqual, deepEqualTry };

function assertIt <Args extends unknown[]> (
  func: (...args: Args) => unknown
) {
  return (...args: Args): void => {
    const err = func(...args);
    if (err) {
      if (typeof err === 'string') {
        throw new Error(err);
      } else {
        throw (err);
      }
    }
  };
}

function spread (a: Iterable<unknown>): unknown[];
function spread (a: object): Array<[string, unknown]>;
function spread (a: Iterable<unknown> | object) {
  if (Symbol.iterator in a && typeof a[Symbol.iterator] === 'function') {
    return [...a];
  } else {
    return Object.entries(a);
  }
}

function notDeepEqual (a: unknown, b: unknown): string | null {
  if (a === b) {
    return null;
  }

  if (a === null || b === null) {
    return error('Null(s) are unequal', a, b);
  }

  if (typeof a !== 'object' || typeof b !== 'object') {
    return error('Non-object(s) are unequal', a, b);
  }

  if (a.constructor !== b.constructor) {
    return error('Constructor(s) are unequal', a.constructor, b.constructor);
  }

  const a_items = spread(a);
  const b_items = spread(b);

  if (a_items.length !== b_items.length) {
    return error('Child counts are unequal', a_items.length, b_items.length);
  }

  for (let i = 0; i < a_items.length; ++i) {
    const item_error = notDeepEqual(a_items[i], b_items[i]);
    if (item_error) {
      // TODO: Improve this error tracing code
      return [
        `Children are unequal: ${limit(a)} :: ${limit(b)}`,
        item_error
      ].join('\n');
    }
  }

  return null;

  function error (msg: string, a: unknown, b: unknown) {
    return `${msg}: ${a} :: ${b}`;
  }
  function limit (x: unknown): string {
    return (Array.isArray(x) && x.length > 10 ? `Array(${x.length})`
      : Array.isArray(x) && x.length === 2 ? `${x[0]}: ${limit(x[1])}`
      : x && typeof x === 'object' ? `[${x.constructor.name}]${JSON.stringify(x, null, 2)}`
      : String(x)
    );
  }
}

function deepEqualTry (...args: Parameters<typeof notDeepEqual>): boolean {
  return !notDeepEqual(...args);
}

const deepEqual = assertIt(notDeepEqual);
