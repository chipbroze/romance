
// Types
export type Dict <V = unknown> = Record<string, V>;
export type NumDict <V = unknown> = Record<number, V>;

// TypeGuards
export function isUint (x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0;
}
export function isObj (x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === 'object';
}
export function isStr (x: unknown): x is string {
  return typeof x === 'string';
}
